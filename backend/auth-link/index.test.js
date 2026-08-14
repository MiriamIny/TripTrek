import { beforeEach, describe, expect, it, vi } from 'vitest'

const send = vi.fn()
const dbSend = vi.fn()
vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: vi.fn(() => ({ send })),
  ListUsersCommand: class ListUsersCommand { constructor(input) { this.input = input; this.kind = 'list' } },
  AdminCreateUserCommand: class AdminCreateUserCommand { constructor(input) { this.input = input; this.kind = 'create' } },
  AdminDeleteUserCommand: class AdminDeleteUserCommand { constructor(input) { this.input = input; this.kind = 'delete' } },
  AdminSetUserPasswordCommand: class AdminSetUserPasswordCommand { constructor(input) { this.input = input; this.kind = 'password' } },
  AdminLinkProviderForUserCommand: class AdminLinkProviderForUserCommand { constructor(input) { this.input = input; this.kind = 'link' } },
  AdminUpdateUserAttributesCommand: class AdminUpdateUserAttributesCommand { constructor(input) { this.input = input; this.kind = 'update' } },
  DescribeUserPoolCommand: class DescribeUserPoolCommand { constructor(input) { this.input = input; this.kind = 'describePool' } },
  UpdateUserPoolCommand: class UpdateUserPoolCommand { constructor(input) { this.input = input; this.kind = 'updatePool' } },
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
    vi.stubEnv('COGNITO_USER_POOL_ID', 'us-east-1_pool')
    dbSend.mockResolvedValue({})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
  })

  it('attaches itself as Pre sign-up trigger without resetting existing pool settings', async () => {
    send
      .mockResolvedValueOnce({
        UserPool: {
          Id: 'us-east-1_pool',
          Name: 'Trek A Trip users',
          Policies: { PasswordPolicy: { MinimumLength: 8 } },
          DeletionProtection: 'ACTIVE',
          AutoVerifiedAttributes: ['email'],
          LambdaConfig: { PostConfirmation: 'arn:aws:lambda:post-confirmation' },
          EmailConfiguration: { EmailSendingAccount: 'COGNITO_DEFAULT' },
          MfaConfiguration: 'OFF',
        },
      })
      .mockResolvedValueOnce({})

    await handler({
      RequestType: 'Create',
      ResponseURL: 'https://cloudformation-response.example.com',
      StackId: 'stack-id',
      RequestId: 'request-id',
      LogicalResourceId: 'CognitoAccountLinkerTrigger',
      ResourceProperties: {
        UserPoolId: 'us-east-1_pool',
        PreSignUpArn: 'arn:aws:lambda:account-linker',
      },
    })

    expect(send.mock.calls.map(([command]) => command.kind)).toEqual(['describePool', 'updatePool'])
    expect(send.mock.calls[1][0].input).toMatchObject({
      UserPoolId: 'us-east-1_pool',
      PoolName: 'Trek A Trip users',
      Policies: { PasswordPolicy: { MinimumLength: 8 } },
      DeletionProtection: 'ACTIVE',
      AutoVerifiedAttributes: ['email'],
      EmailConfiguration: { EmailSendingAccount: 'COGNITO_DEFAULT' },
      MfaConfiguration: 'OFF',
      LambdaConfig: {
        PostConfirmation: 'arn:aws:lambda:post-confirmation',
        PreSignUp: 'arn:aws:lambda:account-linker',
      },
    })
    expect(fetch).toHaveBeenCalledWith(
      'https://cloudformation-response.example.com',
      expect.objectContaining({ method: 'PUT' }),
    )
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

  it('previews an existing duplicate repair without changing Cognito or DynamoDB', async () => {
    send.mockResolvedValueOnce({
      Users: [
        {
          Username: 'native-user',
          Attributes: [
            { Name: 'sub', Value: 'native-sub' },
            { Name: 'email', Value: 'traveler@example.com' },
            { Name: 'email_verified', Value: 'true' },
          ],
        },
        {
          Username: 'google_google-subject',
          Attributes: [
            { Name: 'sub', Value: 'google-owner-sub' },
            { Name: 'email', Value: 'traveler@example.com' },
            { Name: 'email_verified', Value: 'true' },
          ],
        },
      ],
    })

    await expect(handler({
      action: 'repairDuplicateAccount',
      email: 'Traveler@Example.com',
    })).resolves.toEqual({
      status: 'dry-run',
      email: 'traveler@example.com',
      canonicalUsername: 'native-user',
      canonicalOwnerId: 'native-sub',
      duplicateGoogleUsername: 'google_google-subject',
      preservedOwnerIds: ['native-sub', 'google-owner-sub'],
    })
    expect(send.mock.calls.map(([command]) => command.kind)).toEqual(['list'])
    expect(dbSend).not.toHaveBeenCalled()
  })

  it('preserves both owner IDs before deleting and linking an existing Google duplicate', async () => {
    send
      .mockResolvedValueOnce({
        Users: [
          {
            Username: 'native-user',
            Attributes: [
              { Name: 'sub', Value: 'native-sub' },
              { Name: 'email', Value: 'traveler@example.com' },
              { Name: 'email_verified', Value: 'true' },
            ],
          },
          {
            Username: 'google_google-subject',
            Attributes: [
              { Name: 'sub', Value: 'google-owner-sub' },
              { Name: 'email', Value: 'traveler@example.com' },
              { Name: 'email_verified', Value: 'true' },
              { Name: 'name', Value: 'Google Name' },
              { Name: 'picture', Value: 'https://example.com/google.jpg' },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})

    const result = await handler({
      action: 'repairDuplicateAccount',
      email: 'traveler@example.com',
      apply: true,
      confirmation: 'LINK_DUPLICATE_ACCOUNT',
      confirmEmail: 'traveler@example.com',
    })

    expect(result.status).toBe('linked')
    expect(send.mock.calls.map(([command]) => command.kind)).toEqual(['list', 'delete', 'link', 'update'])
    expect(send.mock.calls[1][0].input.Username).toBe('google_google-subject')
    expect(send.mock.calls[2][0].input).toMatchObject({
      DestinationUser: { ProviderName: 'Cognito', ProviderAttributeValue: 'native-user' },
      SourceUser: { ProviderName: 'Google', ProviderAttributeValue: 'google-subject' },
    })
    expect(dbSend.mock.calls[1][0].input.ExpressionAttributeValues).toMatchObject({
      ':ownerIds': ['native-sub', 'google-owner-sub'],
      ':repairPending': true,
    })
    expect(dbSend.mock.calls[3][0].input.ExpressionAttributeValues).toMatchObject({
      ':ownerIds': ['native-sub', 'google-owner-sub'],
      ':mergeNoticePending': true,
      ':repairPending': false,
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
