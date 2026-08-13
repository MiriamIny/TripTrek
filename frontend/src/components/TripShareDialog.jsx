import { useCallback, useEffect, useRef, useState } from 'react'
import { useTripContext } from '../context/TripContext'
import { useAuth } from '../context/AuthContext'
import './TripShareDialog.css'

const PERMISSION_OPTIONS = [
  { value: 'editor', label: 'Editor', description: 'Can view and edit the trip' },
  { value: 'viewer', label: 'Viewer', description: 'Can view but not make changes' },
]

function PermissionDropdown({ value, onChange, disabled, label }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const selected = PERMISSION_OPTIONS.find((option) => option.value === value)
    || PERMISSION_OPTIONS[0]

  useEffect(() => {
    if (!open) return undefined
    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const currentIndex = PERMISSION_OPTIONS.findIndex((option) => option.value === value)
      const direction = event.key === 'ArrowDown' ? 1 : -1
      const nextIndex = (currentIndex + direction + PERMISSION_OPTIONS.length)
        % PERMISSION_OPTIONS.length
      onChange(PERMISSION_OPTIONS[nextIndex].value)
      setOpen(true)
    }
  }

  return (
    <div className="trip-share-permission-dropdown" ref={containerRef}>
      <button
        type="button"
        className="trip-share-permission-trigger"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-label={`${label}: ${selected.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{selected.label}</span>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg>
      </button>

      {open && (
        <div className="trip-share-permission-menu" role="listbox" aria-label={label}>
          {PERMISSION_OPTIONS.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              className="trip-share-permission-option"
              key={option.value}
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
            >
              <span className="trip-share-permission-check" aria-hidden="true">
                {option.value === value && (
                  <svg viewBox="0 0 20 20"><path d="m5 10 3 3 7-7" /></svg>
                )}
              </span>
              <span>
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TripShareDialog({ trip, onClose }) {
  const { getTripCollaborators, shareTrip, removeTripCollaborator } = useTripContext()
  const { userAttributes = {} } = useAuth()
  const [collaborators, setCollaborators] = useState([])
  const [email, setEmail] = useState('')
  const [permission, setPermission] = useState('editor')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [failedOwnerPicture, setFailedOwnerPicture] = useState('')
  const emailInputRef = useRef(null)
  const ownerEmail = userAttributes.email || trip.ownerEmail || ''
  const ownerName = userAttributes.name
    || trip.ownerName
    || ownerEmail.split('@')[0]
    || 'Owner'
  const ownerPicture = userAttributes.picture || ''
  const showOwnerPicture = ownerPicture && ownerPicture !== failedOwnerPicture
  const ownerRow = (
    <li className="trip-share-owner-row">
      <span className="trip-share-avatar" aria-hidden="true">
        {showOwnerPicture ? (
          <img
            src={ownerPicture}
            alt=""
            onError={() => setFailedOwnerPicture(ownerPicture)}
          />
        ) : ownerName.charAt(0).toUpperCase()}
      </span>
      <span className="trip-share-person-copy">
        <strong>{ownerName} <span className="trip-share-you-label">(you)</span></strong>
        {ownerEmail && <small>{ownerEmail}</small>}
      </span>
      <span className="trip-share-owner-label">Owner</span>
    </li>
  )

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
      const result = await shareTrip(trip.id, email, permission)
      setEmail('')
      setMessage(result.invitationEmailSent
        ? `${permission === 'editor' ? 'Editor' : 'Viewer'} access added and invitation emailed.`
        : `${permission === 'editor' ? 'Editor' : 'Viewer'} access added, but the invitation email could not be sent. They can still sign in with that email to view the trip.`)
      await loadCollaborators()
    } catch (shareError) {
      setError(shareError.message || 'Unable to add that collaborator.')
    } finally {
      setSaving(false)
    }
  }

  const handlePermissionChange = async (collaboratorEmail, nextPermission) => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await shareTrip(trip.id, collaboratorEmail, nextPermission, false)
      setMessage(`Access updated to ${nextPermission === 'editor' ? 'Editor' : 'Viewer'}.`)
      await loadCollaborators()
    } catch (permissionError) {
      setError(permissionError.message || 'Unable to update that permission.')
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
          Invite someone by email and decide whether they can edit the itinerary or only view it.
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
            <PermissionDropdown
              value={permission}
              onChange={setPermission}
              disabled={saving}
              label="Invitation permission"
            />
            <button className="trip-share-submit" type="submit" disabled={saving || !email.trim()}>
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
            {!loading && <span>{collaborators.length + 1}</span>}
          </div>

          {loading ? (
            <p className="trip-share-loading">Loading access…</p>
          ) : collaborators.length ? (
            <ul>
              {ownerRow}
              {collaborators.map((collaborator) => (
                <li key={collaborator.email}>
                  <span className="trip-share-avatar" aria-hidden="true">
                    {collaborator.email.charAt(0).toUpperCase()}
                  </span>
                  <span className="trip-share-person-copy">
                    <strong>{collaborator.email}</strong>
                  </span>
                  <PermissionDropdown
                    value={collaborator.permission || 'editor'}
                    onChange={(nextPermission) => handlePermissionChange(collaborator.email, nextPermission)}
                    disabled={saving}
                    label={`Permission for ${collaborator.email}`}
                  />
                  <button
                    type="button"
                    className="trip-share-remove"
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
            <ul>
              {ownerRow}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
