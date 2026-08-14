import { createHash, randomBytes } from 'node:crypto'
import {
  AdminCreateUserCommand,
  AdminLinkProviderForUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'

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

const isNativeProfile = (user) => providerFromUsername(user?.Username)?.name !== 'Google'
const userId = (user) => attributeValue(user, 'sub') || user?.Username || ''

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

const getOrCreateDestination = async (event, email, users) => {
  const existing = chooseDestination(users)
  if (existing) return { user: existing, created: false, users }

  try {
    const createdUser = await createNativeDestination(event, email)
    return { user: createdUser, created: true, users: [...users, createdUser] }
  } catch (error) {
    if (!['AliasExistsException', 'UsernameExistsException'].includes(error.name)) throw error
    const racedDestination = chooseDestination(await listByEmail(event.userPoolId, email))
    if (!racedDestination) throw error
    return { user: racedDestination, created: false, users: [...users, racedDestination] }
  }
}

const recordLinkState = async ({
  email,
  mergedWithExistingPassword,
  observedOwnerIds,
  canonicalOwnerId,
  preferredName,
  preferredPicture,
}) => {
  const key = { pk: accountKey(email), sk: 'AUTH' }
  const current = await dynamo.send(new GetCommand({
    TableName: process.env.AUTH_TABLE_NAME,
    Key: key,
    ConsistentRead: true,
  }))
  const ownerIds = [...new Set([
    ...(Array.isArray(current.Item?.ownerIds) ? current.Item.ownerIds : []),
    ...observedOwnerIds,
    canonicalOwnerId,
  ].filter(Boolean))]

  const names = {}
  const values = {
    ':passwordEnabled': mergedWithExistingPassword,
    ':mergeNoticePending': mergedWithExistingPassword,
    ':welcomeNoticePending': !mergedWithExistingPassword,
    ':canonicalOwnerId': canonicalOwnerId,
    ':ownerIds': ownerIds,
    ':linkedAt': new Date().toISOString(),
  }
  const assignments = [
    'passwordEnabled = :passwordEnabled',
    'mergeNoticePending = :mergeNoticePending',
    'welcomeNoticePending = :welcomeNoticePending',
    'canonicalOwnerId = :canonicalOwnerId',
    'ownerIds = :ownerIds',
    'linkedAt = :linkedAt',
  ]
  if (preferredName) {
    names['#preferredName'] = 'preferredName'
    values[':preferredName'] = preferredName
    assignments.push('#preferredName = :preferredName')
  }
  if (preferredPicture) {
    names['#preferredPicture'] = 'preferredPicture'
    values[':preferredPicture'] = preferredPicture
    assignments.push('#preferredPicture = :preferredPicture')
  }
  await dynamo.send(new UpdateCommand({
    TableName: process.env.AUTH_TABLE_NAME,
    Key: key,
    UpdateExpression: `SET ${assignments.join(', ')}`,
    ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}),
    ExpressionAttributeValues: values,
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

  const users = await listByEmail(event.userPoolId, email)
  const { user: destination, created, users: observedUsers } = await getOrCreateDestination(event, email, users)
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

  const mappedAttributes = ['name', 'picture']
    .map((Name) => ({ Name, Value: event.request.userAttributes?.[Name]?.trim() }))
    .filter((attribute) => attribute.Value)
  if (mappedAttributes.length) {
    await cognito.send(new AdminUpdateUserAttributesCommand({
      UserPoolId: event.userPoolId,
      Username: destination.Username,
      UserAttributes: mappedAttributes,
    }))
  }

  const canonicalOwnerId = userId(destination)
  await recordLinkState({
    email,
    mergedWithExistingPassword: !created,
    observedOwnerIds: [
      ...observedUsers.map(userId),
      event.request.userAttributes?.sub,
    ],
    canonicalOwnerId,
    preferredName: event.request.userAttributes?.name?.trim(),
    preferredPicture: event.request.userAttributes?.picture?.trim(),
  })

  console.info('Linked verified external identity to canonical Cognito profile.', {
    provider: provider.name,
    destinationUsername: destination.Username,
  })
  return event
}
