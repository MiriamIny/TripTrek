import { createHash, randomBytes } from 'node:crypto'
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminLinkProviderForUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  DescribeUserPoolCommand,
  ListUsersCommand,
  UpdateUserPoolCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'

const cognito = new CognitoIdentityProviderClient({})
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const TRUSTED_PROVIDERS = new Set(['Google'])
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const REPAIR_CONFIRMATION = 'LINK_DUPLICATE_ACCOUNT'
const accountKey = (email) => `ACCOUNT#${createHash('sha256').update(email).digest('hex')}`
const UPDATE_USER_POOL_FIELDS = [
  'AccountRecoverySetting',
  'AdminCreateUserConfig',
  'AutoVerifiedAttributes',
  'DeletionProtection',
  'DeviceConfiguration',
  'EmailConfiguration',
  'EmailVerificationMessage',
  'EmailVerificationSubject',
  'IssuerConfiguration',
  'KeyConfiguration',
  'MfaConfiguration',
  'Policies',
  'SmsAuthenticationMessage',
  'SmsConfiguration',
  'SmsVerificationMessage',
  'UserAttributeUpdateSettings',
  'UserPoolAddOns',
  'UserPoolTags',
  'UserPoolTier',
  'VerificationMessageTemplate',
]

const attributeValue = (user, name) => (
  user?.Attributes?.find((attribute) => attribute.Name === name)?.Value || ''
)

const escapeFilterValue = (value) => value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')

const currentPoolUpdate = (pool) => {
  const update = {
    UserPoolId: pool.Id,
    PoolName: pool.Name,
  }
  for (const field of UPDATE_USER_POOL_FIELDS) {
    if (pool[field] !== undefined && pool[field] !== null) update[field] = pool[field]
  }
  update.LambdaConfig = { ...(pool.LambdaConfig || {}) }
  return update
}

const configurePreSignUpTrigger = async ({ userPoolId, preSignUpArn, remove = false }) => {
  const described = await cognito.send(new DescribeUserPoolCommand({ UserPoolId: userPoolId }))
  const pool = described.UserPool
  if (!pool?.Id || !pool?.Name) throw new Error('Cognito did not return the current user-pool configuration.')

  const update = currentPoolUpdate(pool)
  if (remove) {
    if (update.LambdaConfig.PreSignUp !== preSignUpArn) return
    delete update.LambdaConfig.PreSignUp
  } else {
    update.LambdaConfig.PreSignUp = preSignUpArn
  }
  await cognito.send(new UpdateUserPoolCommand(update))
}

const sendCloudFormationResponse = async (event, status, data = {}, reason = '') => {
  const body = JSON.stringify({
    Status: status,
    Reason: reason || `See CloudWatch log stream ${event.LogicalResourceId || ''}`,
    PhysicalResourceId: event.PhysicalResourceId || `CognitoPreSignUp:${event.ResourceProperties.UserPoolId}`,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    NoEcho: false,
    Data: data,
  })
  const result = await fetch(event.ResponseURL, {
    method: 'PUT',
    headers: {
      'content-type': '',
      'content-length': String(Buffer.byteLength(body)),
    },
    body,
  })
  if (!result.ok) throw new Error(`CloudFormation response failed with status ${result.status}.`)
}

const handleTriggerConfiguration = async (event) => {
  const userPoolId = event.ResourceProperties?.UserPoolId
  const preSignUpArn = event.ResourceProperties?.PreSignUpArn
  try {
    if (!userPoolId || !preSignUpArn) throw new Error('UserPoolId and PreSignUpArn are required.')
    await configurePreSignUpTrigger({
      userPoolId,
      preSignUpArn,
      remove: event.RequestType === 'Delete',
    })
    await sendCloudFormationResponse(event, 'SUCCESS', { UserPoolId: userPoolId })
  } catch (error) {
    console.error('Unable to configure the Cognito Pre sign-up trigger.', {
      name: error?.name,
      message: error?.message,
    })
    await sendCloudFormationResponse(event, 'FAILED', {}, error?.message || 'Trigger configuration failed.')
  }
}

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
const hasVerifiedEmail = (user, email) => (
  attributeValue(user, 'email').trim().toLowerCase() === email
  && attributeValue(user, 'email_verified') === 'true'
)

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
    ':repairPending': false,
  }
  const assignments = [
    'passwordEnabled = :passwordEnabled',
    'mergeNoticePending = :mergeNoticePending',
    'welcomeNoticePending = :welcomeNoticePending',
    'canonicalOwnerId = :canonicalOwnerId',
    'ownerIds = :ownerIds',
    'linkedAt = :linkedAt',
    'repairPending = :repairPending',
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

const prepareDuplicateRepair = async ({ email, ownerIds, canonicalOwnerId, preferredName, preferredPicture }) => {
  const key = { pk: accountKey(email), sk: 'AUTH' }
  const current = await dynamo.send(new GetCommand({
    TableName: process.env.AUTH_TABLE_NAME,
    Key: key,
    ConsistentRead: true,
  }))
  const preservedOwnerIds = [...new Set([
    ...(Array.isArray(current.Item?.ownerIds) ? current.Item.ownerIds : []),
    ...ownerIds,
    canonicalOwnerId,
  ].filter(Boolean))]
  const names = {}
  const values = {
    ':passwordEnabled': true,
    ':canonicalOwnerId': canonicalOwnerId,
    ':ownerIds': preservedOwnerIds,
    ':repairPending': true,
    ':repairPreparedAt': new Date().toISOString(),
  }
  const assignments = [
    'passwordEnabled = :passwordEnabled',
    'canonicalOwnerId = :canonicalOwnerId',
    'ownerIds = :ownerIds',
    'repairPending = :repairPending',
    'repairPreparedAt = :repairPreparedAt',
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

const repairDuplicateAccount = async (event) => {
  const email = typeof event.email === 'string' ? event.email.trim().toLowerCase() : ''
  const userPoolId = event.userPoolId || process.env.COGNITO_USER_POOL_ID
  if (!EMAIL_PATTERN.test(email) || !userPoolId) {
    throw new Error('A valid email and Cognito user pool ID are required.')
  }

  const users = (await listByEmail(userPoolId, email)).filter((user) => hasVerifiedEmail(user, email))
  const nativeProfiles = users.filter(isNativeProfile)
  const googleProfiles = users.filter((user) => providerFromUsername(user?.Username)?.name === 'Google')

  if (googleProfiles.length === 0 && nativeProfiles.some((user) => attributeValue(user, 'identities').includes('Google'))) {
    return { status: 'already-linked', email, canonicalUsername: nativeProfiles[0]?.Username }
  }
  if (nativeProfiles.length !== 1 || googleProfiles.length !== 1) {
    throw new Error(
      `Expected exactly one verified native profile and one verified Google profile; found ${nativeProfiles.length} native and ${googleProfiles.length} Google.`,
    )
  }

  const nativeProfile = nativeProfiles[0]
  const googleProfile = googleProfiles[0]
  const provider = providerFromUsername(googleProfile.Username)
  const result = {
    email,
    canonicalUsername: nativeProfile.Username,
    canonicalOwnerId: userId(nativeProfile),
    duplicateGoogleUsername: googleProfile.Username,
    preservedOwnerIds: [...new Set([userId(nativeProfile), userId(googleProfile)].filter(Boolean))],
  }
  if (event.apply !== true) return { status: 'dry-run', ...result }
  if (event.confirmation !== REPAIR_CONFIRMATION || event.confirmEmail?.trim().toLowerCase() !== email) {
    throw new Error(`Apply requires confirmation "${REPAIR_CONFIRMATION}" and a matching confirmEmail.`)
  }

  const preferredName = attributeValue(googleProfile, 'name').trim()
  const preferredPicture = attributeValue(googleProfile, 'picture').trim()
  await prepareDuplicateRepair({
    email,
    ownerIds: result.preservedOwnerIds,
    canonicalOwnerId: result.canonicalOwnerId,
    preferredName,
    preferredPicture,
  })

  // Cognito cannot link an external identity after it has already created its own
  // provider-prefixed user. App ownership aliases are preserved above before this
  // redundant profile is removed.
  await cognito.send(new AdminDeleteUserCommand({
    UserPoolId: userPoolId,
    Username: googleProfile.Username,
  }))
  await cognito.send(new AdminLinkProviderForUserCommand({
    UserPoolId: userPoolId,
    DestinationUser: {
      ProviderName: 'Cognito',
      ProviderAttributeValue: nativeProfile.Username,
    },
    SourceUser: {
      ProviderName: provider.name,
      ProviderAttributeName: 'Cognito_Subject',
      ProviderAttributeValue: provider.subject,
    },
  }))
  const mappedAttributes = [
    { Name: 'name', Value: preferredName },
    { Name: 'picture', Value: preferredPicture },
  ].filter((attribute) => attribute.Value)
  if (mappedAttributes.length) {
    await cognito.send(new AdminUpdateUserAttributesCommand({
      UserPoolId: userPoolId,
      Username: nativeProfile.Username,
      UserAttributes: mappedAttributes,
    }))
  }
  await recordLinkState({
    email,
    mergedWithExistingPassword: true,
    observedOwnerIds: result.preservedOwnerIds,
    canonicalOwnerId: result.canonicalOwnerId,
    preferredName,
    preferredPicture,
  })
  return { status: 'linked', ...result }
}

export const handler = async (event) => {
  if (event.RequestType && event.ResponseURL) return handleTriggerConfiguration(event)
  if (event.action === 'repairDuplicateAccount') return repairDuplicateAccount(event)
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
