import { beforeEach, describe, expect, it, vi } from 'vitest'

const cognitoSend = vi.fn()
const dynamoSend = vi.fn()
vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: vi.fn(() => ({ send: cognitoSend })),
  ListUsersCommand: class ListUsersCommand { constructor(input) { this.input = input } },
}))
vi.mock('@aws-sdk/client-dynamodb', () => ({ DynamoDBClient: vi.fn() }))
vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: dynamoSend })) },
  GetCommand: class GetCommand { constructor(input) { this.input = input; this.kind = 'get' } },
  UpdateCommand: class UpdateCommand { constructor(input) { this.input = input } },
}))

const request = (email) => ({
  requestContext: { http: { method: 'POST', sourceIp: '203.0.113.10' } },
  body: JSON.stringify({ email }),
})

const user = (identities) => ({
  Username: 'canonical-user',
  Attributes: [
    { Name: 'email', Value: 'miriam@example.com' },
    ...(identities ? [{ Name: 'identities', Value: JSON.stringify(identities) }] : []),
  ],
})

describe('accountLookup handler', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('COGNITO_USER_POOL_ID', 'us-east-1_example')
    vi.stubEnv('RATE_LIMIT_TABLE', 'public-rate-limit')
    vi.stubEnv('AUTH_TABLE_NAME', 'trip-table')
    cognitoSend.mockReset()
    dynamoSend.mockReset().mockImplementation(() => Promise.resolve({}))
  })

  it('routes an unknown email to account creation', async () => {
    cognitoSend.mockResolvedValue({ Users: [] })
    const { handler } = await import('./index.js')
    const result = await handler(request('New@Example.com'))
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual({ accountType: 'none' })
    expect(cognitoSend.mock.calls[0][0].input.Filter).toBe('email = "new@example.com"')
  })

  it('routes a native Cognito profile to password sign-in', async () => {
    cognitoSend.mockResolvedValue({ Users: [user()] })
    const { handler } = await import('./index.js')
    const result = await handler(request('miriam@example.com'))
    expect(JSON.parse(result.body)).toEqual({ accountType: 'password' })
  })

  it('routes a Google-linked profile to verified password setup', async () => {
    cognitoSend.mockResolvedValue({
      Users: [user([{ providerName: 'Google', userId: 'google-sub' }])],
    })
    const { handler } = await import('./index.js')
    const result = await handler(request('miriam@example.com'))
    expect(JSON.parse(result.body)).toEqual({ accountType: 'google' })
  })

  it('routes a Google-linked profile with an enabled password to normal sign-in', async () => {
    cognitoSend.mockResolvedValue({
      Users: [user([{ providerName: 'Google', userId: 'google-sub' }])],
    })
    dynamoSend.mockImplementation((command) => (
      command.kind === 'get'
        ? Promise.resolve({ Item: { passwordEnabled: true } })
        : Promise.resolve({})
    ))
    const { handler } = await import('./index.js')
    const result = await handler(request('miriam@example.com'))
    expect(JSON.parse(result.body)).toEqual({ accountType: 'password' })
  })

  it('records password setup only from the authenticated email claim', async () => {
    const { handler } = await import('./index.js')
    const result = await handler({
      requestContext: {
        http: { method: 'PATCH' },
        authorizer: { jwt: { claims: { email: 'Miriam@Example.com' } } },
      },
    })
    expect(result.statusCode).toBe(204)
    expect(dynamoSend.mock.calls[0][0]).toMatchObject({
      input: {
        TableName: 'trip-table',
        ExpressionAttributeValues: expect.objectContaining({ ':passwordEnabled': true }),
      },
    })
  })

  it('returns and consumes a pending merge notice only once', async () => {
    dynamoSend
      .mockResolvedValueOnce({ Item: { mergeNoticePending: true } })
      .mockResolvedValueOnce({})
    const { handler } = await import('./index.js')
    const event = {
      requestContext: {
        http: { method: 'GET' },
        authorizer: { jwt: { claims: { email: 'miriam@example.com' } } },
      },
    }
    const result = await handler(event)
    expect(JSON.parse(result.body)).toEqual({ merged: true })
    expect(dynamoSend.mock.calls[1][0].input).toMatchObject({
      ConditionExpression: 'mergeNoticePending = :pending',
      ExpressionAttributeValues: { ':pending': true, ':consumed': false },
    })

    dynamoSend.mockReset().mockResolvedValueOnce({ Item: { mergeNoticePending: false } })
    const secondResult = await handler(event)
    expect(JSON.parse(secondResult.body)).toEqual({ merged: false })
  })

  it('rejects invalid email without querying Cognito', async () => {
    const { handler } = await import('./index.js')
    const result = await handler(request('not-an-email'))
    expect(result.statusCode).toBe(400)
    expect(cognitoSend).not.toHaveBeenCalled()
  })
})
