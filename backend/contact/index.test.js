import { beforeEach, describe, expect, it, vi } from 'vitest'

const send = vi.fn()
const dbSend = vi.fn()
vi.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: vi.fn(() => ({ send })),
  SendEmailCommand: vi.fn((input) => input),
}))
vi.mock('@aws-sdk/client-dynamodb', () => ({ DynamoDBClient: vi.fn() }))
vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: dbSend })) },
  UpdateCommand: vi.fn((input) => input),
}))

const event = (body) => ({
  requestContext: { http: { method: 'POST' } },
  body: JSON.stringify(body),
})

describe('contactMessage handler', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('SES_SENDER_EMAIL', 'hello@trekatrip.com')
    vi.stubEnv('CONTACT_RECIPIENT_EMAIL', 'owner@example.com')
    vi.stubEnv('RATE_LIMIT_TABLE', 'contact-rate-limit')
    send.mockReset().mockResolvedValue({ MessageId: 'message-1' })
    dbSend.mockReset().mockResolvedValue({})
  })

  it('sends validated contact messages and uses the visitor as reply-to', async () => {
    const { handler } = await import('./index.js')
    const result = await handler(event({
      name: 'Jane Doe',
      email: 'JANE@example.com',
      subject: 'planning',
      message: 'Could you help with my itinerary?',
    }))

    expect(result.statusCode).toBe(202)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toMatchObject({
      Destination: { ToAddresses: ['owner@example.com'] },
      ReplyToAddresses: ['jane@example.com'],
    })
  })

  it('rejects invalid fields before calling SES', async () => {
    const { handler } = await import('./index.js')
    const result = await handler(event({ name: 'Jane', email: 'bad', subject: 'planning', message: 'Short' }))

    expect(result.statusCode).toBe(400)
    expect(send).not.toHaveBeenCalled()
  })

  it('silently accepts honeypot submissions without sending email', async () => {
    const { handler } = await import('./index.js')
    const result = await handler(event({ website: 'https://spam.example' }))

    expect(result.statusCode).toBe(202)
    expect(send).not.toHaveBeenCalled()
  })
})
