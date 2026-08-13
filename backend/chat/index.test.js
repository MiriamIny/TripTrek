import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const send = vi.fn()
vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: vi.fn(() => ({ send })),
  GetSecretValueCommand: vi.fn((input) => input),
}))

const authenticatedEvent = (body) => ({
  requestContext: {
    authorizer: { jwt: { claims: { sub: 'user-123', email: 'user@example.com' } } },
    http: { method: 'POST' },
  },
  body: JSON.stringify(body),
})

describe('trekkaChat handler', () => {
  beforeEach(() => {
    vi.resetModules()
    send.mockResolvedValue({ SecretString: JSON.stringify({ OPENAI_API_KEY: 'test-server-key' }) })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: vi.fn(() => 'req-123') },
      json: vi.fn().mockResolvedValue({ choices: [{ message: { content: 'Visit the castle.' } }] }),
    })
  })

  afterEach(() => vi.restoreAllMocks())

  it('requires Cognito authentication', async () => {
    const { handler } = await import('./index.js')
    const result = await handler({ requestContext: { http: { method: 'POST' } }, body: '{}' })
    expect(result.statusCode).toBe(401)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('loads the key from Secrets Manager and returns only the assistant reply', async () => {
    const { handler } = await import('./index.js')
    const result = await handler(authenticatedEvent({
      mode: 'chat',
      messages: [{ role: 'user', content: 'What should I see?' }],
    }))

    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual({ reply: 'Visit the castle.' })
    expect(send).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    )
    const [, options] = fetch.mock.calls[0]
    expect(options.headers.Authorization).toBe('Bearer test-server-key')
  })

  it('parses a structured itinerary follow-up', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: vi.fn(() => 'req-456') },
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: '{"followup":"Your trip looks exciting!","suggestions":["Find dinner","Packing list","Transit tips"]}' } }],
      }),
    })
    const { handler } = await import('./index.js')
    const result = await handler(authenticatedEvent({
      mode: 'followup',
      trip: { destination: 'Lisbon', itinerary: [] },
    }))

    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual({
      followup: 'Your trip looks exciting!',
      suggestions: ['Find dinner', 'Packing list', 'Transit tips'],
    })
  })
})
