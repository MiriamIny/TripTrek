import { fetchAuthSession } from 'aws-amplify/auth'

export const TRIP_API_ENDPOINT = (
  import.meta.env.VITE_TRIP_API_ENDPOINT
  || 'https://f4ww6942k8.execute-api.us-east-1.amazonaws.com/'
).replace(/\/?$/, '/')

const readErrorMessage = async (response) => {
  try {
    const payload = await response.json()
    return payload?.message || (typeof payload === 'string' ? payload : null)
  } catch {
    return null
  }
}

const request = async (path, options = {}) => {
  const response = await fetch(`${TRIP_API_ENDPOINT}${path.replace(/^\//, '')}`, options)

  if (!response.ok) {
    const message = await readErrorMessage(response)
    throw new Error(message || `Request failed (${response.status}).`)
  }

  return response
}

export const publicTripApiFetch = async (path, options = {}) => request(path, options)

export const tripApiFetch = async (path, options = {}) => {
  const session = await fetchAuthSession()
  const token = session.tokens?.idToken?.toString()

  if (!token) throw new Error('Please sign in to continue.')

  const headers = new Headers(options.headers || {})
  headers.set('Authorization', `Bearer ${token}`)

  return request(path, {
    ...options,
    headers,
  })
}
