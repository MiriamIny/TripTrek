import { useCallback, useEffect, useRef, useState } from 'react'
import { useTripContext } from '../context/TripContext'
import './TripShareDialog.css'

export default function TripShareDialog({ trip, onClose }) {
  const { getTripCollaborators, shareTrip, removeTripCollaborator } = useTripContext()
  const [collaborators, setCollaborators] = useState([])
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const emailInputRef = useRef(null)

  const loadCollaborators = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      setCollaborators(await getTripCollaborators(trip.id))
    } catch (loadError) {
      setError(loadError.message || 'Unable to load collaborators.')
    } finally {
      setLoading(false)
    }
  }, [getTripCollaborators, trip.id])

  useEffect(() => {
    loadCollaborators()
    emailInputRef.current?.focus()
  }, [loadCollaborators])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleInvite = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await shareTrip(trip.id, email)
      setEmail('')
      setMessage('Access added. They will see this trip when they sign in with that email.')
      await loadCollaborators()
    } catch (shareError) {
      setError(shareError.message || 'Unable to add that collaborator.')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (collaboratorEmail) => {
    if (!window.confirm(`Remove ${collaboratorEmail} from this trip?`)) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await removeTripCollaborator(trip.id, collaboratorEmail)
      setMessage('Collaborator removed.')
      await loadCollaborators()
    } catch (removeError) {
      setError(removeError.message || 'Unable to remove that collaborator.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="trip-share-overlay"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="trip-share-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trip-share-title"
      >
        <header className="trip-share-header">
          <div className="trip-share-heading-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="9" cy="8" r="3" />
              <path d="M3.5 18c.5-3.2 2.4-5 5.5-5s5 1.8 5.5 5M16 8h5M18.5 5.5v5" />
            </svg>
          </div>
          <div>
            <p>Travel together</p>
            <h2 id="trip-share-title">Share {trip.destination}</h2>
          </div>
          <button type="button" className="trip-share-close" onClick={onClose} aria-label="Close sharing dialog">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </header>

        <p className="trip-share-intro">
          Invite someone by email. They can view and edit the itinerary with you after signing in.
        </p>

        <form className="trip-share-form" onSubmit={handleInvite}>
          <label htmlFor="trip-share-email">Email address</label>
          <div>
            <input
              ref={emailInputRef}
              id="trip-share-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="travelbuddy@example.com"
              autoComplete="email"
              required
              disabled={saving}
            />
            <button type="submit" disabled={saving || !email.trim()}>
              {saving ? 'Adding…' : 'Add access'}
            </button>
          </div>
        </form>

        <div className="trip-share-feedback" aria-live="polite">
          {error && <p className="trip-share-error">{error}</p>}
          {message && <p className="trip-share-success">{message}</p>}
        </div>

        <div className="trip-share-people">
          <div className="trip-share-people-heading">
            <h3>People with access</h3>
            {!loading && <span>{collaborators.length}</span>}
          </div>

          {loading ? (
            <p className="trip-share-loading">Loading access…</p>
          ) : collaborators.length ? (
            <ul>
              {collaborators.map((collaborator) => (
                <li key={collaborator.email}>
                  <span className="trip-share-avatar" aria-hidden="true">
                    {collaborator.email.charAt(0).toUpperCase()}
                  </span>
                  <span className="trip-share-person-copy">
                    <strong>{collaborator.email}</strong>
                    <small>Can edit</small>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemove(collaborator.email)}
                    disabled={saving}
                    aria-label={`Remove ${collaborator.email}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="trip-share-empty">Only you have access right now.</p>
          )}
        </div>
      </section>
    </div>
  )
}
