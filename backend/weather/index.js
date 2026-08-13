import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'

const secrets = new SecretsManagerClient({})
const SECRET_ID = process.env.GOOGLE_MAPS_SERVER_SECRET_ID || 'TrekATrip/google-maps-server'
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Content-Type': 'application/json',
}
const response = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) })

let apiKeyPromise

const readApiKey = async () => {
  const result = await secrets.send(new GetSecretValueCommand({ SecretId: SECRET_ID }))
  const secretValue = result.SecretString || Buffer.from(result.SecretBinary || '').toString('utf8')
  if (!secretValue) throw new Error('The Google Maps server secret is empty.')

  try {
    const parsed = JSON.parse(secretValue)
    const key = parsed.GOOGLE_MAPS_API_KEY || parsed.apiKey
    if (!key || typeof key !== 'string') throw new Error('The Google Maps server key is missing.')
    return key.trim()
  } catch (error) {
    if (error instanceof SyntaxError) return secretValue.trim()
    throw error
  }
}

const getApiKey = () => {
  if (!apiKeyPromise) apiKeyPromise = readApiKey().catch((error) => {
    apiKeyPromise = null
    throw error
  })
  return apiKeyPromise
}

const parseDate = (value) => {
  const match = String(value || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return null
  const [, month, day, year] = match
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

const weatherIcon = (baseUri) => (baseUri ? `${baseUri}.svg` : '')

const normalizeForecast = (forecast) => ({
  date: `${forecast.displayDate.year}-${String(forecast.displayDate.month).padStart(2, '0')}-${String(forecast.displayDate.day).padStart(2, '0')}`,
  description: forecast.daytimeForecast?.weatherCondition?.description?.text || 'Forecast available',
  iconUrl: weatherIcon(forecast.daytimeForecast?.weatherCondition?.iconBaseUri),
  high: forecast.maxTemperature?.degrees ?? null,
  low: forecast.minTemperature?.degrees ?? null,
  temperatureUnit: forecast.maxTemperature?.unit || forecast.minTemperature?.unit || 'FAHRENHEIT',
  precipitationChance: forecast.daytimeForecast?.precipitation?.probability?.percent ?? null,
  humidity: forecast.daytimeForecast?.relativeHumidity ?? null,
  windSpeed: forecast.daytimeForecast?.wind?.speed?.value ?? null,
  windUnit: forecast.daytimeForecast?.wind?.speed?.unit || '',
})

export const handler = async (event = {}) => {
  if (event.requestContext?.http?.method === 'OPTIONS') return response(204, {})

  const requestedDate = parseDate(event.queryStringParameters?.date)
  const latitude = Number(event.queryStringParameters?.latitude)
  const longitude = Number(event.queryStringParameters?.longitude)
  if (!requestedDate || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return response(400, { message: 'Valid coordinates and a date are required.' })
  }

  try {
    const apiKey = await getApiKey()
    const weatherUrl = new URL('https://weather.googleapis.com/v1/forecast/days:lookup')
    weatherUrl.searchParams.set('key', apiKey)
    weatherUrl.searchParams.set('location.latitude', latitude)
    weatherUrl.searchParams.set('location.longitude', longitude)
    weatherUrl.searchParams.set('days', '10')
    weatherUrl.searchParams.set('pageSize', '10')
    weatherUrl.searchParams.set('unitsSystem', 'IMPERIAL')
    const weatherResponse = await fetch(weatherUrl, { signal: AbortSignal.timeout(8000) })
    const weather = await weatherResponse.json()
    if (!weatherResponse.ok) {
      console.error('Weather API request failed', { status: weatherResponse.status, error: weather.error?.status })
      return response(502, { message: 'Weather is temporarily unavailable.' })
    }

    const forecast = weather.forecastDays?.find((day) => (
      `${day.displayDate.year}-${String(day.displayDate.month).padStart(2, '0')}-${String(day.displayDate.day).padStart(2, '0')}` === requestedDate
    ))
    if (!forecast) {
      return response(200, {
        available: false,
        message: 'A detailed forecast is available when this day is within the next 10 days.',
      })
    }

    return response(200, {
      available: true,
      forecast: normalizeForecast(forecast),
    })
  } catch (error) {
    console.error('Weather request error', error.name, error.message)
    return response(502, { message: 'Weather is temporarily unavailable.' })
  }
}
