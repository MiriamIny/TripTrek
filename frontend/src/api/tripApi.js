import { fetchAuthSession } from 'aws-amplify/auth'

export const TRIP_API_ENDPOINT = (
  import.meta.env.VITE_TRIP_API_ENDPOINT
  || 'https://f4ww6942k8.execute-api.us-east-1.amazonaws.com/'
).replace(/\/?$/, '/')

const readErrorPayload = async (response) => {
  try {
    return await response.json()
  } catch {
    return null
  }
}

const request = async (path, options = {}) => {
  const response = await fetch(`${TRIP_API_ENDPOINT}${path.replace(/^\//, '')}`, options)

  if (!response.ok) {
    const payload = await readErrorPayload(response)
    const error = new Error(
      payload?.message
      || (typeof payload === 'string' ? payload : null)
      || `Request failed (${response.status}).`,
    )
    error.status = response.status
    error.data = payload
    throw error
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
