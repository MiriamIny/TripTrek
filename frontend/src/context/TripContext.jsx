import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { eachDayOfInterval, format, parse } from 'date-fns'
import { v4 as uuidv4 } from 'uuid'
import { useAuth } from './AuthContext'
import { tripApiFetch } from '../api/tripApi'
import {
  buildTripUpdates,
  ensureActivityIds,
  mergeTripDraft,
  normalizeTripRecord,
} from '../utils/tripAutosave'

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
    return { date: dateString, activities: ensureActivityIds([{ date: dateString, activities }])[0].activities }
  })
}

export const TripProvider = ({ children }) => {
  const { user, isAuthenticated, accountReady } = useAuth()
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const tripsRef = useRef([])

  useEffect(() => {
    tripsRef.current = trips
  }, [trips])

  const replaceTrip = useCallback((savedTrip, previousTrip) => {
    const normalized = normalizeTripRecord({
      ...previousTrip,
      ...savedTrip,
      id: savedTrip.id || savedTrip.sk || previousTrip.id,
      sk: savedTrip.sk || savedTrip.id || previousTrip.sk,
      ownerId: savedTrip.ownerId || previousTrip.ownerId,
      access: previousTrip.access,
      sharedByName: previousTrip.sharedByName,
      sharedByEmail: previousTrip.sharedByEmail,
    })
    setTrips((current) => {
      const next = current.map((candidate) => (
        candidate.id === previousTrip.id ? normalized : candidate
      ))
      tripsRef.current = next
      return next
    })
    return normalized
  }, [])

  const fetchTrips = useCallback(async ({ background = false } = {}) => {
    if (!isAuthenticated || !user?.userId) {
      setTrips([])
      setError('')
      return
    }
    if (accountReady === false) return

    if (!background) {
      setLoading(true)
      setError('')
    }
    try {
      const response = await tripApiFetch('getTripList')
      const data = await response.json()
      const normalizedTrips = (Array.isArray(data) ? data : []).map(normalizeTripRecord)
      tripsRef.current = normalizedTrips
      setTrips(normalizedTrips)
    } catch (fetchError) {
      console.error('Error fetching trips:', fetchError)
      if (!background) setError(fetchError.message || 'Unable to load your trips.')
    } finally {
      if (!background) setLoading(false)
    }
  }, [accountReady, isAuthenticated, user?.userId])

  const deleteTrip = useCallback(async (tripId) => {
    const trip = trips.find((candidate) => candidate.id === tripId)
    const isShared = trip?.access && trip.access !== 'owner'
    const path = isShared
      ? `tripShares?tripId=${encodeURIComponent(tripId)}&ownerId=${encodeURIComponent(trip.ownerId)}`
      : `deleteTrip?tripId=${encodeURIComponent(tripId)}&ownerId=${encodeURIComponent(trip?.ownerId || user?.userId)}`

    await tripApiFetch(path, { method: 'DELETE' })
    await fetchTrips()
  }, [fetchTrips, trips, user?.userId])

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
    const finalTrip = normalizeTripRecord({ ...trip, itinerary: makeItinerary(trip) })

    if (trip.id) {
      const existingTrip = tripsRef.current.find((candidate) => candidate.id === trip.id)
      if (!existingTrip) throw new Error('This trip is no longer available.')
      if (existingTrip.access === 'viewer') {
        throw new Error('You have view-only access to this trip.')
      }

      const ownerId = existingTrip.ownerId
      let updates = buildTripUpdates(existingTrip, finalTrip)
      if (!Object.keys(updates).length) return existingTrip

      try {
        const saved = await updateTripAPI(
          trip.id,
          updates,
          ownerId,
          existingTrip.version ?? 0,
        )
        return replaceTrip(saved, existingTrip)
      } catch (saveError) {
        const remoteTrip = saveError.status === 409 && saveError.data?.currentTrip
        if (!remoteTrip) throw saveError

        const latest = normalizeTripRecord({
          ...remoteTrip,
          access: existingTrip.access,
          ownerId,
          sharedByName: existingTrip.sharedByName,
          sharedByEmail: existingTrip.sharedByEmail,
        })
        const rebased = mergeTripDraft(existingTrip, finalTrip, latest)
        updates = buildTripUpdates(latest, rebased)
        if (!Object.keys(updates).length) return replaceTrip(latest, existingTrip)

        const saved = await updateTripAPI(
          trip.id,
          updates,
          ownerId,
          latest.version ?? 0,
        )
        return replaceTrip(saved, existingTrip)
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
    return finalTrip
  }, [fetchTrips, replaceTrip, updateTripAPI])

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

    return imageUrl
  }, [trips])

  const getTripCollaborators = useCallback(async (tripId, ownerId) => {
    const query = new URLSearchParams({ tripId })
    if (ownerId) query.set('ownerId', ownerId)
    const response = await tripApiFetch(`tripShares?${query}`)
    return response.json()
  }, [])

  const getTripBuddies = useCallback(async (tripId, ownerId) => {
    const query = new URLSearchParams({ tripId, includeProfiles: 'true' })
    if (ownerId) query.set('ownerId', ownerId)
    const response = await tripApiFetch(`tripShares?${query}`)
    return response.json()
  }, [])

  const shareTrip = useCallback(async (
    tripId,
    email,
    permission = 'editor',
    sendEmail = true,
    invitationMessage = '',
    ownerId,
  ) => {
    const response = await tripApiFetch('tripShares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId, email, permission, sendEmail, invitationMessage, ownerId }),
    })
    return response.json()
  }, [])

  const removeTripCollaborator = useCallback(async (tripId, email, ownerId) => {
    const owner = ownerId ? `&ownerId=${encodeURIComponent(ownerId)}` : ''
    await tripApiFetch(
      `tripShares?tripId=${encodeURIComponent(tripId)}&email=${encodeURIComponent(email)}${owner}`,
      { method: 'DELETE' },
    )
  }, [])

  const getTripById = useCallback((id) => trips.find((trip) => trip.id === id), [trips])

  useEffect(() => {
    if (isAuthenticated && user?.userId && accountReady !== false) fetchTrips()
    else {
      setTrips([])
      setLoading(false)
      setError('')
    }
  }, [accountReady, fetchTrips, isAuthenticated, user?.userId])

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
      getTripBuddies,
      shareTrip,
      removeTripCollaborator,
    }}>
      {children}
    </TripContext.Provider>
  )
}
