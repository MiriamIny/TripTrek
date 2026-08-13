import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { eachDayOfInterval, format, parse } from 'date-fns'
import { v4 as uuidv4 } from 'uuid'
import { useAuth } from './AuthContext'
import { tripApiFetch } from '../api/tripApi'

const TripContext = createContext()

export const useTripContext = () => {
  const context = useContext(TripContext)
  if (!context) throw new Error('useTripContext must be used within a TripProvider')
  return context
}

const parseMDY = (value) => parse(value, 'MM/dd/yyyy', new Date())

const makeItinerary = (trip) => {
  const days = eachDayOfInterval({
    start: parseMDY(trip.startDate),
    end: parseMDY(trip.endDate),
  })

  return days.map((date) => {
    const dateString = format(date, 'MM/dd/yyyy')
    const activities = trip.itinerary?.find((day) => day.date === dateString)?.activities || []
    return { date: dateString, activities: [...activities] }
  })
}

export const TripProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth()
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchTrips = useCallback(async () => {
    if (!isAuthenticated || !user?.userId) {
      setTrips([])
      setError('')
      return
    }

    setLoading(true)
    setError('')
    try {
      const response = await tripApiFetch('getTripList')
      const data = await response.json()
      setTrips((Array.isArray(data) ? data : []).map((trip) => ({
        ...trip,
        id: trip.sk,
        ownerId: trip.ownerId || trip.pk,
        access: trip.access || 'owner',
        itinerary: trip.itinerary?.map((day) => ({
          ...day,
          activities: [...(day.activities || [])],
        })) || [],
      })))
    } catch (fetchError) {
      console.error('Error fetching trips:', fetchError)
      setError(fetchError.message || 'Unable to load your trips.')
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, user?.userId])

  const deleteTrip = useCallback(async (tripId) => {
    const trip = trips.find((candidate) => candidate.id === tripId)
    const isShared = trip?.access && trip.access !== 'owner'
    const path = isShared
      ? `tripShares?tripId=${encodeURIComponent(tripId)}&ownerId=${encodeURIComponent(trip.ownerId)}`
      : `deleteTrip?tripId=${encodeURIComponent(tripId)}`

    await tripApiFetch(path, { method: 'DELETE' })
    await fetchTrips()
  }, [fetchTrips, trips])

  const updateTripAPI = useCallback(async (tripId, updates, ownerId, expectedVersion) => {
    const query = new URLSearchParams({ tripId })
    if (ownerId && ownerId !== user?.userId) query.set('ownerId', ownerId)

    const response = await tripApiFetch(`updateTrip?${query}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates, expectedVersion }),
    })
    return response.json()
  }, [user?.userId])

  const saveTrip = useCallback(async (trip) => {
    const finalTrip = { ...trip, itinerary: makeItinerary(trip) }

    if (trip.id) {
      const existingTrip = trips.find((candidate) => candidate.id === trip.id)
      if (!existingTrip) throw new Error('This trip is no longer available.')
      if (existingTrip.access === 'viewer') {
        throw new Error('You have view-only access to this trip.')
      }

      const ownerId = existingTrip.ownerId
      const updates = {}
      if (existingTrip.destination !== trip.destination) {
        updates.destination = finalTrip.destination
        updates.mapData = null
      }
      if (existingTrip.startDate !== trip.startDate) {
        updates.startDate = trip.startDate
      }
      if (existingTrip.endDate !== trip.endDate) {
        updates.endDate = trip.endDate
      }
      if (!('mapData' in updates)
        && JSON.stringify(existingTrip.mapData) !== JSON.stringify(trip.mapData)) {
        updates.mapData = trip.mapData ?? null
      }
      if (JSON.stringify(existingTrip.itinerary) !== JSON.stringify(finalTrip.itinerary)) {
        updates.itinerary = finalTrip.itinerary
      }
      if (Object.keys(updates).length) {
        await updateTripAPI(trip.id, updates, ownerId, existingTrip.version ?? 0)
      }
    } else {
      finalTrip.id = uuidv4()
      finalTrip.sk = finalTrip.id
      await tripApiFetch('createTrip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalTrip),
      })
    }

    await fetchTrips()
  }, [fetchTrips, trips, updateTripAPI])

  const uploadTripImage = useCallback(async (file, locationName, tripId) => {
    const trip = tripId ? trips.find((candidate) => candidate.id === tripId) : null
    if (trip?.access === 'viewer') throw new Error('You have view-only access to this trip.')

    const extension = file.name.split('.').pop()
    const safeBase = (locationName || 'trip')
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]+/g, '')
      .replace(/--+/g, '-')
    const uniqueFileName = `${safeBase}/${uuidv4()}.${extension}`

    const response = await tripApiFetch('generateUploadUrl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileType: file.type, fileName: uniqueFileName }),
    })
    const { uploadUrl, imageUrl } = await response.json()

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    })
    if (!uploadResponse.ok) throw new Error('Unable to upload that image.')

    if (tripId) {
      await updateTripAPI(
        tripId,
        { imageUrl },
        trip?.ownerId,
        trip?.version ?? 0,
      )
      await fetchTrips()
    }
    return imageUrl
  }, [fetchTrips, trips, updateTripAPI])

  const getTripCollaborators = useCallback(async (tripId) => {
    const response = await tripApiFetch(`tripShares?tripId=${encodeURIComponent(tripId)}`)
    return response.json()
  }, [])

  const shareTrip = useCallback(async (tripId, email, permission = 'editor') => {
    const response = await tripApiFetch('tripShares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId, email, permission }),
    })
    return response.json()
  }, [])

  const removeTripCollaborator = useCallback(async (tripId, email) => {
    await tripApiFetch(
      `tripShares?tripId=${encodeURIComponent(tripId)}&email=${encodeURIComponent(email)}`,
      { method: 'DELETE' },
    )
  }, [])

  const getTripById = useCallback((id) => trips.find((trip) => trip.id === id), [trips])

  useEffect(() => {
    if (isAuthenticated && user?.userId) fetchTrips()
    else {
      setTrips([])
      setLoading(false)
      setError('')
    }
  }, [fetchTrips, isAuthenticated, user?.userId])

  return (
    <TripContext.Provider value={{
      trips,
      loading,
      error,
      fetchTrips,
      deleteTrip,
      saveTrip,
      getTripById,
      uploadTripImage,
      getTripCollaborators,
      shareTrip,
      removeTripCollaborator,
    }}>
      {children}
    </TripContext.Provider>
  )
}
