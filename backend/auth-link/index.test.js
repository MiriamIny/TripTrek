import { beforeEach, describe, expect, it, vi } from 'vitest'

const send = vi.fn()
const dbSend = vi.fn()
vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: vi.fn(() => ({ send })),
  ListUsersCommand: class ListUsersCommand { constructor(input) { this.input = input; this.kind = 'list' } },
  AdminCreateUserCommand: class AdminCreateUserCommand { constructor(input) { this.input = input; this.kind = 'create' } },
  AdminSetUserPasswordCommand: class AdminSetUserPasswordCommand { constructor(input) { this.input = input; this.kind = 'password' } },
  AdminLinkProviderForUserCommand: class AdminLinkProviderForUserCommand { constructor(input) { this.input = input; this.kind = 'link' } },
  AdminUpdateUserAttributesCommand: class AdminUpdateUserAttributesCommand { constructor(input) { this.input = input; this.kind = 'update' } },
}))
vi.mock('@aws-sdk/client-dynamodb', () => ({ DynamoDBClient: vi.fn() }))
vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: dbSend })) },
  GetCommand: class GetCommand { constructor(input) { this.input = input; this.kind = 'get' } },
  UpdateCommand: class UpdateCommand { constructor(input) { this.input = input; this.kind = 'state' } },
}))

const { handler } = await import('./index.js')
const googleEvent = (overrides = {}) => ({
  triggerSource: 'PreSignUp_ExternalProvider',
  userPoolId: 'us-east-1_pool',
  userName: 'Google_google-subject',
  request: {
    userAttributes: {
      email: 'Traveler@Example.com',
      email_verified: 'true',
      name: 'Google Name',
      picture: 'https://example.com/photo.jpg',
    },
  },
  response: {},
  ...overrides,
})

describe('Cognito account linker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('AUTH_TABLE_NAME', 'trip-table')
    dbSend.mockResolvedValue({})
  })

  it('links a first Google sign-in to an existing native Cognito account', async () => {
    send
      .mockResolvedValueOnce({ Users: [{ Username: 'native-sub', UserStatus: 'CONFIRMED' }] })
      .mockResolvedValueOnce({})

    const event = googleEvent()
    await expect(handler(event)).resolves.toBe(event)

    expect(send).toHaveBeenCalledTimes(3)
    expect(send.mock.calls[1][0].input).toMatchObject({
      DestinationUser: { ProviderName: 'Cognito', ProviderAttributeValue: 'native-sub' },
      SourceUser: {
        ProviderName: 'Google',
        ProviderAttributeName: 'Cognito_Subject',
        ProviderAttributeValue: 'google-subject',
      },
    })
    expect(dbSend.mock.calls[1][0].input.ExpressionAttributeValues).toMatchObject({
      ':passwordEnabled': true,
      ':mergeNoticePending': true,
    })
  })

  it('creates a canonical native profile before a Google-first account is linked', async () => {
    send
      .mockResolvedValueOnce({ Users: [] })
      .mockResolvedValueOnce({ User: { Username: 'generated-native-sub' } })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})

    await handler(googleEvent())

    expect(send.mock.calls.map(([command]) => command.kind)).toEqual(['list', 'create', 'password', 'link', 'update'])
    expect(send.mock.calls[1][0].input).toMatchObject({
      Username: 'traveler@example.com',
      MessageAction: 'SUPPRESS',
    })
    expect(send.mock.calls[2][0].input).toMatchObject({ Permanent: true })
    expect(dbSend.mock.calls[1][0].input.ExpressionAttributeValues).toMatchObject({
      ':passwordEnabled': false,
      ':mergeNoticePending': false,
    })
  })

  it('rejects unverified external email addresses', async () => {
    const event = googleEvent()
    event.request.userAttributes.email_verified = 'false'
    await expect(handler(event)).rejects.toThrow('verified Google email')
    expect(send).not.toHaveBeenCalled()
  })

  it('ignores native email sign-up events', async () => {
    const event = googleEvent({ triggerSource: 'PreSignUp_SignUp', userName: 'traveler@example.com' })
    await expect(handler(event)).resolves.toBe(event)
    expect(send).not.toHaveBeenCalled()
  })
})
