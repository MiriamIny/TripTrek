import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbSend = vi.fn()
const sesSend = vi.fn()

vi.mock('@aws-sdk/client-dynamodb', () => ({ DynamoDBClient: vi.fn() }))
vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: dbSend })) },
  GetCommand: vi.fn((input) => ({ type: 'get', ...input })),
  QueryCommand: vi.fn((input) => ({ type: 'query', ...input })),
  TransactWriteCommand: vi.fn((input) => ({ type: 'transaction', ...input })),
}))
vi.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: vi.fn(() => ({ send: sesSend })),
  SendEmailCommand: vi.fn((input) => input),
}))

const event = (body) => ({
  requestContext: {
    authorizer: { jwt: { claims: { sub: 'owner-1', name: 'Miriam', email: 'owner@example.com' } } },
    http: { method: 'POST' },
  },
  body: JSON.stringify(body),
})

describe('tripShares invitation email', () => {
  beforeEach(() => {
    vi.resetModules()
    dbSend.mockReset()
      .mockResolvedValueOnce({ Item: {
        pk: 'owner-1',
        sk: 'trip-1',
        destination: 'Lisbon',
        startDate: '09/01/2026',
        endDate: '09/08/2026',
      } })
      .mockResolvedValueOnce({})
    sesSend.mockReset().mockResolvedValue({ MessageId: 'message-1' })
  })

  it('emails a newly invited collaborator', async () => {
    const { handler } = await import('./index.js')
    const result = await handler(event({
      tripId: 'trip-1',
      email: 'friend@example.com',
      permission: 'viewer',
      invitationMessage: 'Can’t wait!\nBring your hiking boots <script>alert(1)</script>',
    }))
    const body = JSON.parse(result.body)

    expect(result.statusCode).toBe(201)
    expect(body.invitationEmailSent).toBe(true)
    expect(sesSend).toHaveBeenCalledTimes(1)
    expect(sesSend.mock.calls[0][0]).toMatchObject({
      Destination: { ToAddresses: ['friend@example.com'] },
      ReplyToAddresses: ['owner@example.com'],
    })
    const email = sesSend.mock.calls[0][0].Content.Simple.Body
    expect(email.Text.Data).toContain('Can’t wait!\nBring your hiking boots')
    expect(email.Html.Data).toContain('Can’t wait!\nBring your hiking boots')
    expect(email.Html.Data).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(email.Html.Data).not.toContain('<script>alert(1)</script>')
  })

  it('rejects an invitation message longer than 500 characters before writing access', async () => {
    const { handler } = await import('./index.js')
    const result = await handler(event({
      tripId: 'trip-1',
      email: 'friend@example.com',
      permission: 'viewer',
      invitationMessage: 'x'.repeat(501),
    }))

    expect(result.statusCode).toBe(400)
    expect(JSON.parse(result.body).message).toMatch(/500 characters/)
    expect(dbSend).not.toHaveBeenCalled()
    expect(sesSend).not.toHaveBeenCalled()
  })

  it('skips email for permission-only updates', async () => {
    const { handler } = await import('./index.js')
    const result = await handler(event({
      tripId: 'trip-1',
      email: 'friend@example.com',
      permission: 'editor',
      sendEmail: false,
    }))

    expect(JSON.parse(result.body).invitationEmailSent).toBe(false)
    expect(sesSend).not.toHaveBeenCalled()
  })

  it('keeps access successful if SES delivery fails', async () => {
    sesSend.mockRejectedValueOnce(new Error('SES unavailable'))
    const { handler } = await import('./index.js')
    const result = await handler(event({ tripId: 'trip-1', email: 'friend@example.com', permission: 'viewer' }))

    expect(result.statusCode).toBe(201)
    expect(JSON.parse(result.body).invitationEmailSent).toBe(false)
  })
})
