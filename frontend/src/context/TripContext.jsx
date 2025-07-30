// src/context/TripContext.jsx
import { createContext, useContext, useState, useEffect } from 'react'
import { format, eachDayOfInterval, parse } from 'date-fns'
import { v4 as uuidv4 } from 'uuid'

const TripContext = createContext()

export const useTripContext = () => {
  const context = useContext(TripContext)
  if (!context) {
    throw new Error('useTripContext must be used within a TripProvider')
  }
  return context
}

export const TripProvider = ({ children }) => {
  const API_Endpoint = 'https://ne4b8p6lzg.execute-api.us-east-1.amazonaws.com/'
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(false)

  // helper to parse MM/DD/YYYY → Date
  const parseMDY = str => parse(str, 'MM/dd/yyyy', new Date())

  // helper to convert 12h → 24h HH:mm
  const convertTo24Hour = timeStr => {
    const [time, mod] = timeStr.split(' ')
    let [h, m] = time.split(':')
    if (mod === 'PM' && h !== '12') h = String(+h + 12)
    if (mod === 'AM' && h === '12') h = '00'
    return `${h.padStart(2, '0')}:${m}`
  }

  // RETRIEVE ALL
  const fetchTrips = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_Endpoint}getTripList`, {
        method: 'GET',
      });
      if (!response.ok) throw new Error(`Failed to load trips: ${response.status}`)

      const data = await response.json()

      const tripsWithSortedItinerary = data.map(trip => ({
        ...trip,
        id: trip.pk,
        itinerary: trip.itinerary?.map(day => ({
          ...day,
          activities: [...(day.activities || [])].sort((a, b) => {
            const aTime = convertTo24Hour(a.time)
            const bTime = convertTo24Hour(b.time)
            return aTime.localeCompare(bTime)
          })
        })) || []
      }))

      setTrips(tripsWithSortedItinerary)
    } catch (err) {
      console.error('Error fetching trips:', err)
    } finally {
      setLoading(false)
    }
  }

  // DELETE
  const deleteTrip = async (id) => {
    try {
      const response = await fetch(`${API_Endpoint}deleteTrip?tripId=${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete trip. Status: ${response.status}`);
      }

      // Update UI after successful deletion
      await fetchTrips() // refresh from backend
    } catch (err) {
      console.error('Error deleting trip:', err);
      alert('Failed to delete trip. Please try again.');
    }
  };

  // UPDATE with API call
  const updateTripAPI = async (tripId, attributeName, newValue) => {
    try {
      const res = await fetch(`${API_Endpoint}updateTrip?tripId=${encodeURIComponent(tripId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attributeName, newValue })
        }
      )

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`API error: ${res.status} ${errText}`)
      }

      const result = await res.json()
      return result
    } catch (err) {
      console.error('API call failed:', err)
    }
  }

  // SAVE (new or edit)
  const saveTrip = async (trip) => {
    // regenerate the complete itinerary with every date from start → end
    const days = eachDayOfInterval({
      start: parseMDY(trip.startDate),
      end: parseMDY(trip.endDate)
    })

    const itinerary = days.map(date => {
      const dateStr = format(date, 'MM/dd/yyyy')
      // find any existing activities for that day
      const dayActivities =
        trip.itinerary.find(d => d.date === dateStr)?.activities || []

      // sort activities by time ascending
      const sortedActivities = [...dayActivities].sort((a, b) => {
        const a24 = convertTo24Hour(a.time)
        const b24 = convertTo24Hour(b.time)
        return a24.localeCompare(b24)
      })

      return { date: dateStr, activities: sortedActivities }
    })

    const finalTrip = { ...trip, itinerary }

    if (trip.id) {
      // use API call to update backend
      const existingTrip = trips.find(t => t.id === trip.id)
      if (existingTrip) {
        if (existingTrip.destination !== trip.destination) {
          await updateTripAPI(trip.id, 'destination', finalTrip.destination)
        }

        if (existingTrip.startDate !== trip.startDate) {
          await updateTripAPI(trip.id, 'startDate', trip.startDate)
        }

        if (existingTrip.endDate !== trip.endDate) {
          await updateTripAPI(trip.id, 'endDate', trip.endDate)
        }

        if (
          JSON.stringify(existingTrip.itinerary) !==
          JSON.stringify(finalTrip.itinerary)
        ) {
          await updateTripAPI(trip.id, 'itinerary', finalTrip.itinerary)
        }
      }

    } else {
      // new trip
      const createTrip = async () => {
        try {
          const response = await fetch(`${API_Endpoint}createTrip`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(finalTrip),
          });

          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }

          const data = await response.json();
          alert('Trip created successfully!');
        } catch (error) {
          alert('Failed to create trip.');
        }
      };
      finalTrip.id = uuidv4()
      await createTrip();
    }
    // re-fetch from backend after save
    await fetchTrips();
  }

  // Get trip by ID
  const getTripById = (id) => {
    return trips.find(trip => trip.id === id)
  }

  useEffect(() => {
    fetchTrips()
  }, [])

  const value = {
    trips,
    loading,
    fetchTrips,
    deleteTrip,
    saveTrip,
    getTripById
  }

  return (
    <TripContext.Provider value={value}>
      {children}
    </TripContext.Provider>
  )
}
