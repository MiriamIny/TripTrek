import { useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import './AuthNotice.css'

export default function AuthNotice() {
  const { authNotice, dismissAuthNotice } = useAuth()

  useEffect(() => {
    if (!authNotice) return undefined
    const timer = window.setTimeout(dismissAuthNotice, 7000)
    return () => window.clearTimeout(timer)
  }, [authNotice, dismissAuthNotice])

  if (!authNotice) return null

  return (
    <div className="auth-account-notice" role="status" aria-live="polite">
      <span className="auth-account-notice-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>
      </span>
      <div>
        <strong>{authNotice.title}</strong>
        <p>{authNotice.message}</p>
      </div>
      <button type="button" onClick={dismissAuthNotice} aria-label="Dismiss notification">×</button>
    </div>
  )
}
