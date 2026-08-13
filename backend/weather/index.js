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

const normalizeDayPart = (part, label, temperature) => ({
  label,
  description: part?.weatherCondition?.description?.text || 'Forecast available',
  iconUrl: weatherIcon(part?.weatherCondition?.iconBaseUri),
  temperature,
  precipitationChance: part?.precipitation?.probability?.percent ?? null,
  humidity: part?.relativeHumidity ?? null,
  windSpeed: part?.wind?.speed?.value ?? null,
})

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
  periods: [
    normalizeDayPart(forecast.daytimeForecast, 'Daytime', forecast.maxTemperature?.degrees ?? null),
    normalizeDayPart(forecast.nighttimeForecast, 'Nighttime', forecast.minTemperature?.degrees ?? null),
  ],
})

const hourlyDate = (hour) => {
  const value = hour?.displayDateTime
  if (!value) return ''
  return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`
}

const normalizeHour = (hour) => ({
  hour: hour.displayDateTime?.hours ?? null,
  description: hour.weatherCondition?.description?.text || 'Forecast available',
  iconUrl: weatherIcon(hour.weatherCondition?.iconBaseUri),
  temperature: hour.temperature?.degrees ?? null,
  feelsLike: hour.feelsLikeTemperature?.degrees ?? null,
  precipitationChance: hour.precipitation?.probability?.percent ?? null,
  humidity: hour.relativeHumidity ?? null,
  windSpeed: hour.wind?.speed?.value ?? null,
  isDaytime: hour.isDaytime ?? null,
})

const googleWeatherRequest = async (url, apiKey) => {
  const result = await fetch(url, {
    headers: { 'X-Goog-Api-Key': apiKey },
    signal: AbortSignal.timeout(8000),
  })
  const body = await result.json()
  if (!result.ok) {
    const error = new Error('Google Weather API request failed.')
    error.status = result.status
    error.googleStatus = body.error?.status
    throw error
  }
  return body
}

const loadHourlyForecast = async ({ apiKey, latitude, longitude, requestedDate }) => {
  const url = new URL('https://weather.googleapis.com/v1/forecast/hours:lookup')
  url.searchParams.set('location.latitude', latitude)
  url.searchParams.set('location.longitude', longitude)
  url.searchParams.set('hours', '240')
  url.searchParams.set('pageSize', '24')
  url.searchParams.set('unitsSystem', 'IMPERIAL')

  const matchingHours = []
  let pageToken = ''
  for (let page = 0; page < 10; page += 1) {
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const weather = await googleWeatherRequest(url, apiKey)
    const hours = weather.forecastHours || []
    matchingHours.push(...hours.filter((hour) => hourlyDate(hour) === requestedDate))

    const lastDate = hourlyDate(hours.at(-1))
    if (matchingHours.length && lastDate !== requestedDate) break
    if (lastDate && lastDate > requestedDate) break
    pageToken = weather.nextPageToken
    if (!pageToken) break
  }

  return matchingHours.map(normalizeHour)
}

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
    weatherUrl.searchParams.set('location.latitude', latitude)
    weatherUrl.searchParams.set('location.longitude', longitude)
    weatherUrl.searchParams.set('days', '10')
    weatherUrl.searchParams.set('pageSize', '10')
    weatherUrl.searchParams.set('unitsSystem', 'IMPERIAL')
    const weather = await googleWeatherRequest(weatherUrl, apiKey)

    const forecast = weather.forecastDays?.find((day) => (
      `${day.displayDate.year}-${String(day.displayDate.month).padStart(2, '0')}-${String(day.displayDate.day).padStart(2, '0')}` === requestedDate
    ))
    if (!forecast) {
      return response(200, {
        available: false,
        message: 'A detailed forecast is available when this day is within the next 10 days.',
      })
    }

    let hourly = []
    try {
      hourly = await loadHourlyForecast({ apiKey, latitude, longitude, requestedDate })
    } catch (hourlyError) {
      console.warn('Hourly Weather API request failed', {
        message: hourlyError.message,
        status: hourlyError.status,
        googleStatus: hourlyError.googleStatus,
      })
    }

    return response(200, {
      available: true,
      forecast: normalizeForecast(forecast),
      hourly,
    })
  } catch (error) {
    console.error('Weather request error', {
      name: error.name,
      message: error.message,
      status: error.status,
      googleStatus: error.googleStatus,
    })
    return response(502, { message: 'Weather is temporarily unavailable.' })
  }
}
