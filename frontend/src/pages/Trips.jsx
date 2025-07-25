// src/pages/Trips.jsx
import { useState, useEffect } from 'react'
import TripForm from '../components/trips/TripForm'
import TripList from '../components/trips/TripList'
import { format, eachDayOfInterval, parse } from 'date-fns'
import { v4 as uuidv4 } from 'uuid'
 
 
export default function Trips() {
  
  const API_Endpoint =  'https://ne4b8p6lzg.execute-api.us-east-1.amazonaws.com'
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedTrip, setSelectedTrip] = useState(null)
  const [editingTrip, setEditingTrip] = useState(null)

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
 
  useEffect(() => { fetchTrips()}, [])
 
  // DELETE
  const handleDelete = async (id) => {
    try {
      const response = await fetch(`${API_Endpoint}deleteTrip?tripId=${id}`, {
        method: 'DELETE',
      });
 
      if (!response.ok) {
        throw new Error(`Failed to delete trip. Status: ${response.status}`);
      }
 
      // Update UI after successful deletion
      await fetchTrips() // refresh from backend
      setSelectedTrip(null);
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
      console.log('Trip updated via API:', result)
      return result
    } catch (err) {
      console.error('API call failed:', err)
    }
  }
 
  // SAVE (new or edit)
  const handleSave = async(trip) => {
    // regenerate the complete itinerary with every date from start → end
    const days = eachDayOfInterval({
      start: parseMDY(trip.startDate),
      end:   parseMDY(trip.endDate)
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
      const saveTrip = async () => {
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
          console.log('Trip successfully created:', data);
          alert('Trip created successfully!');
        } catch (error) {
          console.error('Error creating trip:', error);       
          alert('Failed to create trip.');
        }
      };
      finalTrip.id = uuidv4()
      await saveTrip();
    }
    // re-fetch from backend after save
    await fetchTrips();
   
    setEditingTrip(null)
    setSelectedTrip(null)
  }
 
  return (
    <div className="container bg-light-sand py-5 text-slate-gray">
      
      <h2 className="text-center mb-4 text-forest-green">
        {!selectedTrip && !editingTrip && 'Destinations'}
        {selectedTrip && !editingTrip && 'Itinerary'}
        {selectedTrip && editingTrip && editingTrip.destination}
      </h2>

      {loading && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center" style={{ zIndex: 1050 }}>
          <div className="spinner-border text-terra" role="status"></div>
        </div>
      )}

      {!selectedTrip && !editingTrip && !loading &&(
        <>
          <button
            className="btn btn-terra mb-4 d-block mx-auto"
            onClick={() =>
              setEditingTrip({
                destination: '',
                startDate: '',
                endDate: '',
                itinerary: []
              })
            }
          >
            + New Trip
          </button>
 
          <div className="mx-auto" style={{ maxWidth: '500px' }}>
            {<TripList
                trips={trips}
                onSelect={setSelectedTrip}
                onDelete={handleDelete}
              />
            }
          </div>
        </>
      )}
 
      {editingTrip && (
        <TripForm
          trip={editingTrip}
          onSave={handleSave}
          onCancel={() => setEditingTrip(null)}
        />
      )}
 
      {selectedTrip && !editingTrip && (
        <div>
          <div className="d-flex justify-content-center mb-3">
            <button
              className="btn btn-secondary mb-3 me-2"
              onClick={() => setSelectedTrip(null)}
            >
              &larr; Back
            </button>
            <button
              className="btn btn-terra mb-3 me-2"
              onClick={() => setEditingTrip(selectedTrip)}
            >
              Edit
            </button>
          </div>
 
          <h4 className="text-forest-green mb-3 text-center">
            {selectedTrip.destination} — {selectedTrip.startDate} to{' '}
            {selectedTrip.endDate}
          </h4>
 
          {selectedTrip.itinerary.map((dayPlan, idx) => (
            <div
              key={idx}
              className="mb-4 p-4 bg-white-custom rounded shadow-sm"
            >
              <h5 className="text-forest-green">{dayPlan.date}</h5>
              {Array.isArray(dayPlan.activities) && dayPlan.activities.length > 0 ? (
                <ul className="list-unstyled">
                  {dayPlan.activities.map((ev, i) => (
                    <li key={i} className="d-flex mb-1">
                      <div
                        className="me-3 text-end"
                        style={{ width: '80px' }}
                      >
                        <strong>{ev.time}</strong>
                      </div>
                      <div>{ev.name}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-muted">No activities planned for this day.</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
