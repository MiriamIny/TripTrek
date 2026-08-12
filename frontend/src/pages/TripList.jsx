import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TripForm from '../components/TripForm'
import { useTripContext } from '../context/TripContext'
import { useAuth } from '../context/AuthContext'
import './TripList.css'

const parseTripDate = (value) => {
  if (!value) return null
  const match = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return null

  const [, month, day, year] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))

  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) {
    return null
  }

  return date
}

const formatTripDates = (startValue, endValue) => {
  const start = parseTripDate(startValue)
  const end = parseTripDate(endValue)

  if (!start || !end) return `${startValue || 'Dates TBD'}${endValue ? ` – ${endValue}` : ''}`

  const sameYear = start.getFullYear() === end.getFullYear()
  const startOptions = sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' }

  return `${start.toLocaleDateString('en-US', startOptions)} – ${end.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`
}

const getTripDuration = (startValue, endValue) => {
  const start = parseTripDate(startValue)
  const end = parseTripDate(endValue)
  if (!start || !end || end < start) return null

  const millisecondsPerDay = 1000 * 60 * 60 * 24
  return Math.round((end - start) / millisecondsPerDay) + 1
}

const getActivityCount = (trip) => (
  (trip.itinerary || []).reduce(
    (total, day) => total + (Array.isArray(day.activities) ? day.activities.length : 0),
    0,
  )
)

const pluralize = (count, singular, plural = `${singular}s`) => (
  `${count} ${count === 1 ? singular : plural}`
)

function RouteMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M10 36c3-9 8-7 10-15 2-7 8-9 17-9" />
      <circle cx="10" cy="36" r="3" />
      <path d="M37 7.5c-3.3 0-6 2.6-6 5.9 0 4.4 6 10.1 6 10.1s6-5.7 6-10.1c0-3.3-2.7-5.9-6-5.9Z" />
      <circle cx="37" cy="13.5" r="2" />
    </svg>
  )
}

function TripsLoadingState({ label = 'Loading your trips…' }) {
  return (
    <main className="trips-dashboard">
      <div className="trips-dashboard-inner" aria-live="polite" aria-busy="true">
        <header className="trips-dashboard-header trips-dashboard-header--loading">
          <div>
            <span className="trips-skeleton trips-skeleton--eyebrow" />
            <span className="trips-skeleton trips-skeleton--title" />
            <span className="trips-skeleton trips-skeleton--copy" />
          </div>
        </header>
        <span className="visually-hidden">{label}</span>
        <div className="trips-card-grid" aria-hidden="true">
          {[1, 2, 3].map((item) => (
            <div className="trip-card trip-card--skeleton" key={item}>
              <span className="trips-skeleton trip-card-skeleton-media" />
              <span className="trips-skeleton trip-card-skeleton-line" />
              <span className="trips-skeleton trip-card-skeleton-line trip-card-skeleton-line--short" />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

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
    } catch (saveError) {
      console.error('Failed to save trip:', saveError)
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
      } catch (deleteError) {
        console.error('Failed to delete trip:', deleteError)
        alert('Failed to delete trip. Please try again.')
      } finally {
        setOperationLoading(false)
      }
    }
  }, [deleteTrip])

  const handleTripClick = useCallback((tripId) => {
    navigate(`/trips/${tripId}`)
  }, [navigate])

  if (authStatus === 'configuring') {
    return <TripsLoadingState label="Checking sign-in status…" />
  }

  if (!isAuthenticated) {
    return (
      <main className="trips-guest">
        <section className="trips-guest-card">
          <div className="trips-guest-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="8.5" />
              <path d="m15.2 8.8-1.7 4.7-4.7 1.7 1.7-4.7 4.7-1.7Z" />
            </svg>
          </div>
          <p className="trips-guest-eyebrow">Your trips</p>
          <h1>Plan your next adventure</h1>
          <p className="trips-guest-intro">
            Sign in to create new trips, view saved itineraries, and keep every plan in one place.
          </p>
          <button type="button" className="trips-auth-button" onClick={openAuth}>
            Sign In or Create Account
          </button>
        </section>
      </main>
    )
  }

  if (error) {
    return (
      <main className="trips-dashboard">
        <section className="trips-error-state" role="alert">
          <div className="trips-error-icon" aria-hidden="true">!</div>
          <p className="trips-eyebrow">We hit a detour</p>
          <h1>We couldn’t load your trips.</h1>
          <p>{error}</p>
          <button type="button" className="trips-primary-button" onClick={fetchTrips}>
            Try again
          </button>
        </section>
      </main>
    )
  }

  if (loading && trips.length === 0) {
    return <TripsLoadingState />
  }

  const isLoading = loading || operationLoading
  const hasTrips = trips.length > 0
  const totalActivities = trips.reduce((total, trip) => total + getActivityCount(trip), 0)

  if (showForm) {
    return (
      <main className="trips-dashboard trips-dashboard--form">
        <div className="trips-dashboard-inner">
          <header className="trip-form-header">
            <button
              type="button"
              className="trips-back-button"
              onClick={() => setShowForm(false)}
              disabled={operationLoading}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m15 18-6-6 6-6" />
              </svg>
              Back to trips
            </button>
            <p className="trips-eyebrow">Start somewhere new</p>
            <h1>Create a new trip</h1>
          </header>

          <section className="trip-form-stage" aria-label="Create a new trip">
            <TripForm
              trip={{
                destination: '',
                startDate: '',
                endDate: '',
                itinerary: [],
              }}
              onSave={handleSave}
              onCancel={() => setShowForm(false)}
            />
          </section>
        </div>

        {operationLoading && (
          <div className="trips-operation-overlay" aria-live="polite">
            <span className="trips-loader" aria-hidden="true" />
            <span>Saving your trip…</span>
          </div>
        )}
      </main>
    )
  }

  return (
    <main className="trips-dashboard">
      <div className="trips-dashboard-inner">
        <header className="trips-dashboard-header">
          <div className="trips-dashboard-heading">
            <p className="trips-eyebrow">My journeys</p>
            <h1>Your trips</h1>
            <p>Keep every destination, date, and plan together—ready whenever you are.</p>
          </div>

          {hasTrips && (
            <button
              type="button"
              className="trips-primary-button trips-new-button"
              onClick={() => setShowForm(true)}
              disabled={isLoading}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New trip
            </button>
          )}
        </header>

        {hasTrips ? (
          <section className="trips-saved" aria-labelledby="saved-trips-heading">
            <div className="trips-section-heading">
              <div>
                <h2 id="saved-trips-heading">All trips</h2>
                <p>
                  {pluralize(trips.length, 'saved trip')}
                  {totalActivities > 0 ? ` · ${pluralize(totalActivities, 'planned activity', 'planned activities')}` : ''}
                </p>
              </div>
            </div>

            <div className="trips-card-grid">
              {trips.map((trip, index) => {
                const activityCount = getActivityCount(trip)
                const duration = getTripDuration(trip.startDate, trip.endDate)

                return (
                  <article className="trip-card" key={trip.id}>
                    <button
                      type="button"
                      className="trip-card-open"
                      onClick={() => handleTripClick(trip.id)}
                      aria-label={`View trip to ${trip.destination}`}
                    >
                      <span className="trip-card-media">
                        {trip.imageUrl ? (
                          <img src={trip.imageUrl} alt="" />
                        ) : (
                          <span className={`trip-card-fallback trip-card-fallback--${(index % 3) + 1}`}>
                            <RouteMark />
                          </span>
                        )}
                        <span className="trip-card-saved-label">Saved trip</span>
                      </span>

                      <span className="trip-card-content">
                        <span className="trip-card-title-row">
                          <span className="trip-card-title">{trip.destination}</span>
                          <span className="trip-card-arrow" aria-hidden="true">
                            <svg viewBox="0 0 24 24">
                              <path d="M5 12h13M13 6l6 6-6 6" />
                            </svg>
                          </span>
                        </span>

                        <span className="trip-card-dates">
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" />
                          </svg>
                          {formatTripDates(trip.startDate, trip.endDate)}
                        </span>

                        <span className="trip-card-meta">
                          {duration && <span>{pluralize(duration, 'day')}</span>}
                          {activityCount > 0 && <span>{pluralize(activityCount, 'activity', 'activities')}</span>}
                          {!duration && activityCount === 0 && <span>Ready to plan</span>}
                        </span>
                      </span>
                    </button>

                    <button
                      type="button"
                      className="trip-card-delete"
                      onClick={() => handleDelete(trip.id)}
                      disabled={isLoading}
                      aria-label={`Delete trip to ${trip.destination}`}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
                      </svg>
                    </button>
                  </article>
                )
              })}
            </div>
          </section>
        ) : (
          <section className="trips-empty-state" aria-labelledby="empty-trips-heading">
            <div className="trips-empty-illustration" aria-hidden="true">
              <span className="trips-empty-orbit" />
              <span className="trips-empty-route"><RouteMark /></span>
              <span className="trips-empty-stamp">
                <img src="/triptrek.svg" alt="" />
              </span>
            </div>
            <p className="trips-eyebrow">A blank itinerary, in the best way</p>
            <h2 id="empty-trips-heading">Your next adventure starts here.</h2>
            <p>
              Add a destination and travel dates. You can shape the details at your own pace.
            </p>
            <button
              type="button"
              className="trips-primary-button"
              onClick={() => setShowForm(true)}
              disabled={isLoading}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Plan your first trip
            </button>
          </section>
        )}
      </div>

      {operationLoading && (
        <div className="trips-operation-overlay" aria-live="polite">
          <span className="trips-loader" aria-hidden="true" />
          <span>Updating your trips…</span>
        </div>
      )}
    </main>
  )
}
