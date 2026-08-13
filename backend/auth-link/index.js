import { randomBytes } from 'node:crypto'
import { createHash } from 'node:crypto'
import {
  AdminCreateUserCommand,
  AdminLinkProviderForUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb'

const cognito = new CognitoIdentityProviderClient({})
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const TRUSTED_PROVIDERS = new Set(['Google'])
const accountKey = (email) => `ACCOUNT#${createHash('sha256').update(email).digest('hex')}`

const attributeValue = (user, name) => (
  user?.Attributes?.find((attribute) => attribute.Name === name)?.Value || ''
)

const escapeFilterValue = (value) => value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')

const providerFromUsername = (username = '') => {
  const separator = username.indexOf('_')
  if (separator < 1) return null
  const rawProvider = username.slice(0, separator)
  return {
    name: `${rawProvider.charAt(0).toUpperCase()}${rawProvider.slice(1).toLowerCase()}`,
    subject: username.slice(separator + 1),
  }
}

const listByEmail = async (userPoolId, email) => {
  const result = await cognito.send(new ListUsersCommand({
    UserPoolId: userPoolId,
    Filter: `email = "${escapeFilterValue(email)}"`,
    Limit: 20,
  }))
  return result.Users || []
}

const isNativeProfile = (user) => !providerFromUsername(user?.Username)?.name

const chooseDestination = (users) => users
  .filter(isNativeProfile)
  .sort((left, right) => {
    const confirmedDifference = Number(right.UserStatus === 'CONFIRMED') - Number(left.UserStatus === 'CONFIRMED')
    if (confirmedDifference) return confirmedDifference
    return new Date(left.UserCreateDate || 0) - new Date(right.UserCreateDate || 0)
  })[0]

const createNativeDestination = async (event, email) => {
  const attributes = [
    { Name: 'email', Value: email },
    { Name: 'email_verified', Value: 'true' },
  ]
  for (const name of ['name', 'picture']) {
    const value = event.request.userAttributes?.[name]
    if (typeof value === 'string' && value.trim()) attributes.push({ Name: name, Value: value.trim() })
  }

  const created = await cognito.send(new AdminCreateUserCommand({
    UserPoolId: event.userPoolId,
    Username: email,
    UserAttributes: attributes,
    MessageAction: 'SUPPRESS',
  }))
  const username = created.User?.Username
  if (!username) throw new Error('Cognito did not return the destination username.')

  // A random permanent password makes password recovery available without exposing
  // or emailing an administrator-created temporary password.
  await cognito.send(new AdminSetUserPasswordCommand({
    UserPoolId: event.userPoolId,
    Username: username,
    Password: `Aa1!${randomBytes(32).toString('base64url')}`,
    Permanent: true,
  }))
  return created.User
}

const getOrCreateDestination = async (event, email) => {
  const existing = chooseDestination(await listByEmail(event.userPoolId, email))
  if (existing) return { user: existing, created: false }

  try {
    return { user: await createNativeDestination(event, email), created: true }
  } catch (error) {
    if (!['AliasExistsException', 'UsernameExistsException'].includes(error.name)) throw error
    const racedDestination = chooseDestination(await listByEmail(event.userPoolId, email))
    if (!racedDestination) throw error
    return { user: racedDestination, created: false }
  }
}

const recordLinkState = async (email, mergedWithExistingPassword) => {
  await dynamo.send(new UpdateCommand({
    TableName: process.env.AUTH_TABLE_NAME,
    Key: { pk: accountKey(email), sk: 'AUTH' },
    UpdateExpression: [
      'SET passwordEnabled = :passwordEnabled',
      'mergeNoticePending = :mergeNoticePending',
      'linkedAt = :linkedAt',
    ].join(', '),
    ExpressionAttributeValues: {
      ':passwordEnabled': mergedWithExistingPassword,
      ':mergeNoticePending': mergedWithExistingPassword,
      ':linkedAt': new Date().toISOString(),
    },
  }))
}

export const handler = async (event) => {
  if (event.triggerSource !== 'PreSignUp_ExternalProvider') return event

  const provider = providerFromUsername(event.userName)
  const email = event.request.userAttributes?.email?.trim().toLowerCase()
  const emailVerified = event.request.userAttributes?.email_verified === 'true'
  if (!provider || !TRUSTED_PROVIDERS.has(provider.name) || !email || !emailVerified) {
    throw new Error('Automatic account linking requires a verified Google email address.')
  }

  const { user: destination, created } = await getOrCreateDestination(event, email)
  await cognito.send(new AdminLinkProviderForUserCommand({
    UserPoolId: event.userPoolId,
    DestinationUser: {
      ProviderName: 'Cognito',
      ProviderAttributeValue: destination.Username,
    },
    SourceUser: {
      ProviderName: provider.name,
      ProviderAttributeName: 'Cognito_Subject',
      ProviderAttributeValue: provider.subject,
    },
  }))
  await recordLinkState(email, !created)

  console.info('Linked verified external identity to canonical Cognito profile.', {
    provider: provider.name,
    destinationUsername: destination.Username,
  })
  return event
}
