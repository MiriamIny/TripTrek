import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const send = vi.fn()
vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: vi.fn(() => ({ send })),
  GetSecretValueCommand: vi.fn((input) => input),
}))

const weatherEvent = (overrides = {}) => ({
  requestContext: { http: { method: 'GET' } },
  queryStringParameters: {
    date: '08/13/2026',
    latitude: '45.7777',
    longitude: '-111.1520',
    ...overrides,
  },
})

const googleResponse = (body) => ({
  ok: true,
  status: 200,
  json: vi.fn().mockResolvedValue(body),
})

describe('tripWeather handler', () => {
  beforeEach(() => {
    vi.resetModules()
    send.mockResolvedValue({ SecretString: JSON.stringify({ GOOGLE_MAPS_API_KEY: 'weather-key' }) })
    global.fetch = vi.fn()
      .mockResolvedValueOnce(googleResponse({
        forecastDays: [{
          displayDate: { year: 2026, month: 8, day: 13 },
          maxTemperature: { degrees: 82, unit: 'FAHRENHEIT' },
          minTemperature: { degrees: 55, unit: 'FAHRENHEIT' },
          daytimeForecast: {
            weatherCondition: { description: { text: 'Sunny' }, iconBaseUri: 'https://example.com/day' },
            precipitation: { probability: { percent: 5 } },
            relativeHumidity: 34,
            wind: { speed: { value: 9, unit: 'MILES_PER_HOUR' } },
          },
          nighttimeForecast: {
            weatherCondition: { description: { text: 'Clear' }, iconBaseUri: 'https://example.com/night' },
            precipitation: { probability: { percent: 2 } },
            relativeHumidity: 48,
            wind: { speed: { value: 4, unit: 'MILES_PER_HOUR' } },
          },
        }],
      }))
      .mockResolvedValueOnce(googleResponse({
        forecastHours: [
          {
            displayDateTime: { year: 2026, month: 8, day: 13, hours: 9 },
            weatherCondition: { description: { text: 'Sunny' }, iconBaseUri: 'https://example.com/hour' },
            temperature: { degrees: 67 },
            feelsLikeTemperature: { degrees: 66 },
            precipitation: { probability: { percent: 3 } },
            relativeHumidity: 40,
            wind: { speed: { value: 5 } },
            isDaytime: true,
          },
          {
            displayDateTime: { year: 2026, month: 8, day: 13, hours: 20 },
            weatherCondition: { description: { text: 'Clear' } },
            temperature: { degrees: 60 },
            isDaytime: false,
          },
          {
            displayDateTime: { year: 2026, month: 8, day: 14, hours: 2 },
            weatherCondition: { description: { text: 'Clear' } },
            temperature: { degrees: 52 },
            isDaytime: false,
          },
        ],
      }))
  })

  afterEach(() => vi.restoreAllMocks())

  it('returns daytime, nighttime, and only the selected local date hourly forecast', async () => {
    const { handler } = await import('./index.js')
    const result = await handler(weatherEvent())
    const body = JSON.parse(result.body)

    expect(result.statusCode).toBe(200)
    expect(body.forecast.periods.map((period) => period.label)).toEqual(['Daytime', 'Nighttime'])
    expect(body.hourly).toHaveLength(2)
    expect(body.hourly[0]).toMatchObject({ hour: 9, temperature: 67, precipitationChance: 3 })
    expect(body.forecast.periods).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Daytime', temperature: 82 }),
      expect.objectContaining({ label: 'Nighttime', temperature: 55 }),
    ]))
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[1][0].pathname).toBe('/v1/forecast/hours:lookup')
    expect(fetch.mock.calls[1][1].headers['X-Goog-Api-Key']).toBe('weather-key')
  })

  it('rejects invalid coordinates before contacting Google', async () => {
    const { handler } = await import('./index.js')
    const result = await handler(weatherEvent({ latitude: '200' }))

    expect(result.statusCode).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })
})
