import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbSend = vi.fn()
vi.mock('@aws-sdk/client-dynamodb', () => ({ DynamoDBClient: vi.fn() }))
vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: dbSend })) },
  GetCommand: class GetCommand { constructor(input) { this.input = input } },
  UpdateCommand: class UpdateCommand { constructor(input) { this.input = input } },
}))

const { handler } = await import('./index.js')
const event = (method, body, claims = { sub: 'owner-1', email: 'owner@example.com' }) => ({
  requestContext: { http: { method }, authorizer: { jwt: { claims } } },
  queryStringParameters: { tripId: 'trip-1', ownerId: 'owner-1' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

describe('trip workspace handler', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads saved workspace content for the trip owner', async () => {
    dbSend
      .mockResolvedValueOnce({ Item: { pk: 'owner-1', sk: 'trip-1' } })
      .mockResolvedValueOnce({ Item: { notes: 'Gate B', todos: [], packingItems: [] } })

    const result = await handler(event('GET'))

    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body).notes).toBe('Gate B')
    expect(dbSend.mock.calls[1][0].input.Key).toEqual({ pk: 'owner-1', sk: 'WORKSPACE#trip-1' })
  })

  it('lets an editor save a normalized checklist', async () => {
    dbSend
      .mockResolvedValueOnce({ Item: { pk: 'owner-1', sk: 'trip-1' } })
      .mockResolvedValueOnce({ Item: { permission: 'editor' } })
      .mockResolvedValueOnce({ Attributes: { todos: [{ id: 'one', text: 'Book train', completed: false }] } })

    const result = await handler(event('PATCH', {
      todos: [{ id: 'one', text: '  Book train  ', completed: false }],
    }, { sub: 'friend-1', email: 'FRIEND@example.com' }))

    expect(result.statusCode).toBe(200)
    expect(dbSend.mock.calls[1][0].input.Key.pk).toBe('INVITEE#friend@example.com')
    expect(dbSend.mock.calls[2][0].input.ExpressionAttributeValues[':value0'][0].text).toBe('Book train')
  })

  it('keeps viewers read only', async () => {
    dbSend
      .mockResolvedValueOnce({ Item: { pk: 'owner-1', sk: 'trip-1' } })
      .mockResolvedValueOnce({ Item: { permission: 'viewer' } })

    const result = await handler(event('PATCH', { notes: 'No changes' }, {
      sub: 'viewer-1', email: 'viewer@example.com',
    }))

    expect(result.statusCode).toBe(403)
    expect(dbSend).toHaveBeenCalledTimes(2)
  })
})
