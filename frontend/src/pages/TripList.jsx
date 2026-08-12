// src/pages/TripList.jsx (Main trips page)
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import TripForm from '../components/TripForm'
import { useTripContext } from '../context/TripContext'
import { useAuth } from '../context/AuthContext'

export default function TripList() {
  const navigate = useNavigate()
  const { trips, loading, error, deleteTrip, saveTrip, fetchTrips } = useTripContext()
  const { isAuthenticated, authStatus, openAuth } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [operationLoading, setOperationLoading] = useState(false)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (isAuthenticated && !initialized) {
      fetchTrips()
      setInitialized(true)
    }
  }, [fetchTrips, initialized, isAuthenticated])

  const handleSave = useCallback(async (trip) => {
    setOperationLoading(true)
    try {
      await saveTrip(trip)
      setShowForm(false)
    } catch (error) {
      console.error('Failed to save trip:', error)
      alert('Failed to save trip. Please try again.')
    } finally {
      setOperationLoading(false)
    }
  }, [saveTrip])

  const handleDelete = useCallback(async (tripId) => {
    if (window.confirm('Are you sure you want to delete this trip?')) {
      setOperationLoading(true)
      try {
        await deleteTrip(tripId)
      } catch (error) {
        console.error('Failed to delete trip:', error)
        alert('Failed to delete trip. Please try again.')
      } finally {
        setOperationLoading(false)
      }
    }
  }, [deleteTrip])

  const handleTripClick = useCallback((tripId) => {
    navigate(`/trips/${tripId}`)
  }, [navigate])

  const isLoading = loading || operationLoading

  if (authStatus === 'configuring') {
    return (
      <div className="container py-5 text-center" aria-live="polite">
        <div className="spinner-border text-forest-green" role="status">
          <span className="visually-hidden">Checking sign-in status...</span>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <main className="trips-guest container">
        <section className="trips-guest-card">
          <div className="trips-guest-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M5 20V9l7-5 7 5v11M9 20v-6h6v6" />
            </svg>
          </div>
          <h1>Plan your next adventure</h1>
          <p>Sign in to create new trips, view your saved itineraries, and keep all your travel plans in one place.</p>
          <button type="button" className="btn btn-terra trips-auth-button" onClick={openAuth}>
            Sign In or Create Account
          </button>
        </section>
      </main>
    )
  }

  if (error) {
    return (
      <div className="container bg-light-sand py-5 text-slate-gray">
        <div className="alert alert-danger text-center">
          <h4>Error Loading Trips</h4>
          <p>{error}</p>
          <button className="btn btn-terra" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container bg-light-sand py-5 text-slate-gray">
      <h2 className="text-center mb-4 text-forest-green">
        {showForm ? 'New Trip' : 'Trips'}
      </h2>

      {isLoading && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center" style={{ zIndex: 1050 }}>
          <div className="spinner-border text-terra" role="status"></div>
          <span className="visually-hidden">Loading...</span>
        </div>
      )}

      {showForm ? (
        <TripForm
          trip={{
            destination: '',
            startDate: '',
            endDate: '',
            itinerary: []
          }}
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        !isLoading && (
          <>
            <button
              className="btn btn-terra mb-4 d-block mx-auto"
              onClick={() => setShowForm(true)}
              disabled={isLoading}
            >
              + New Trip
            </button>

            <div className="mx-auto" style={{ maxWidth: '500px' }}>
              {trips.length === 0 && !loading ? (
                <div className="text-center text-muted py-4">
                  No trips planned yet. Start trekking!
                </div>
              ) : (
                <div className="list-group">
                  {trips.map((trip) => (
                    <div
                      key={trip.id}
                      className="list-group-item list-group-item-action d-flex justify-content-between align-items-center mb-3 py-3"
                      onClick={() => handleTripClick(trip.id)}
                      style={{ cursor: "pointer" }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleTripClick(trip.id)
                        }
                      }}
                    >
                      <div className="d-flex align-items-center">
                        {trip.imageUrl && (
                          <img
                            src={trip.imageUrl}
                            alt={trip.destination}
                            className="img-thumbnail me-3"
                            width="80"
                            height="80"
                          />
                        )}
                        <div className="flex-grow-1">
                          <h6 className="mb-1">{trip.destination}</h6>
                          <p className="mb-0 text-muted">
                            {trip.startDate} to {trip.endDate}
                          </p>
                        </div>
                        <button
                          className="btn btn-sm btn-outline-danger ms-3"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(trip.id);
                          }}
                          disabled={isLoading}
                          aria-label={`Delete trip to ${trip.destination}`}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )
      )}
    </div>
  )
}
