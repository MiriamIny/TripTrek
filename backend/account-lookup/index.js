import { createHash } from 'node:crypto'
import { CognitoIdentityProviderClient, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'

const cognito = new CognitoIdentityProviderClient({})
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RATE_LIMIT = 20
const RATE_WINDOW_SECONDS = 15 * 60

const accountKey = (email) => `ACCOUNT#${createHash('sha256').update(email).digest('hex')}`

const response = (statusCode, body) => ({
  statusCode,
  headers: {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  },
  body: JSON.stringify(body),
})

const attributeValue = (user, name) => (
  user?.Attributes?.find((attribute) => attribute.Name === name)?.Value || ''
)

const escapeFilterValue = (value) => value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')

const linkedProviders = (users) => {
  const providers = new Set()
  for (const user of users) {
    const identities = attributeValue(user, 'identities')
    if (!identities) continue
    try {
      for (const identity of JSON.parse(identities)) {
        if (typeof identity?.providerName === 'string') providers.add(identity.providerName.toLowerCase())
      }
    } catch {
      console.warn('Ignoring malformed Cognito identities attribute.', { username: user.Username })
    }
  }
  return providers
}

const hasEnabledPassword = async (email) => {
  const result = await dynamo.send(new GetCommand({
    TableName: process.env.AUTH_TABLE_NAME,
    Key: { pk: accountKey(email), sk: 'AUTH' },
    ConsistentRead: true,
  }))
  return result.Item?.passwordEnabled === true
}

const markPasswordEnabled = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims || {}
  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : ''
  if (!EMAIL_PATTERN.test(email)) return response(403, { message: 'A verified account is required.' })

  await dynamo.send(new UpdateCommand({
    TableName: process.env.AUTH_TABLE_NAME,
    Key: { pk: accountKey(email), sk: 'AUTH' },
    UpdateExpression: 'SET passwordEnabled = :passwordEnabled, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':passwordEnabled': true,
      ':updatedAt': new Date().toISOString(),
    },
  }))
  return { statusCode: 204, headers: { 'cache-control': 'no-store' }, body: '' }
}

const consumeMergeNotice = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims || {}
  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : ''
  if (!EMAIL_PATTERN.test(email)) return response(403, { message: 'A verified account is required.' })

  const key = { pk: accountKey(email), sk: 'AUTH' }
  const current = await dynamo.send(new GetCommand({
    TableName: process.env.AUTH_TABLE_NAME,
    Key: key,
    ConsistentRead: true,
  }))
  if (current.Item?.mergeNoticePending !== true) {
    return response(200, { merged: false })
  }

  try {
    await dynamo.send(new UpdateCommand({
      TableName: process.env.AUTH_TABLE_NAME,
      Key: key,
      UpdateExpression: 'SET mergeNoticePending = :consumed',
      ConditionExpression: 'mergeNoticePending = :pending',
      ExpressionAttributeValues: { ':pending': true, ':consumed': false },
    }))
    return response(200, { merged: true })
  } catch (error) {
    if (error?.name === 'ConditionalCheckFailedException') return response(200, { merged: false })
    throw error
  }
}

const enforceRateLimit = async (event) => {
  const tableName = process.env.RATE_LIMIT_TABLE
  if (!tableName) return

  const now = Math.floor(Date.now() / 1000)
  const windowStart = Math.floor(now / RATE_WINDOW_SECONDS) * RATE_WINDOW_SECONDS
  const sourceIp = event.requestContext?.http?.sourceIp || 'unknown'
  try {
    await dynamo.send(new UpdateCommand({
      TableName: tableName,
      Key: { rateKey: `account-lookup:${sourceIp}:${windowStart}` },
      UpdateExpression: 'ADD requestCount :one SET expiresAt = :expiresAt',
      ConditionExpression: 'attribute_not_exists(requestCount) OR requestCount < :limit',
      ExpressionAttributeValues: {
        ':one': 1,
        ':limit': RATE_LIMIT,
        ':expiresAt': windowStart + RATE_WINDOW_SECONDS * 2,
      },
    }))
  } catch (error) {
    if (error?.name === 'ConditionalCheckFailedException') {
      const rateError = new Error('Too many account checks. Please wait a few minutes and try again.')
      rateError.statusCode = 429
      throw rateError
    }
    throw error
  }
}

export const handler = async (event) => {
  const method = event.requestContext?.http?.method
  if (method === 'GET') {
    try {
      return await consumeMergeNotice(event)
    } catch (error) {
      console.error('Unable to consume merge notice.', { name: error?.name, message: error?.message })
      return response(500, { message: 'We could not check the account-link status.' })
    }
  }
  if (method === 'PATCH') {
    try {
      return await markPasswordEnabled(event)
    } catch (error) {
      console.error('Unable to record password setup.', { name: error?.name, message: error?.message })
      return response(500, { message: 'Password was added, but account setup could not be completed.' })
    }
  }
  if (method !== 'POST') {
    return response(405, { message: 'Method not allowed.' })
  }

  try {
    await enforceRateLimit(event)
    const payload = JSON.parse(event.body || '{}')
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      return response(400, { message: 'Enter a valid email address.' })
    }

    const result = await cognito.send(new ListUsersCommand({
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      Filter: `email = "${escapeFilterValue(email)}"`,
      Limit: 20,
    }))
    const users = result.Users || []
    if (users.length === 0) return response(200, { accountType: 'none' })

    const providers = linkedProviders(users)
    if (providers.has('google') && await hasEnabledPassword(email)) {
      return response(200, { accountType: 'password' })
    }
    return response(200, {
      accountType: providers.has('google') ? 'google' : 'password',
    })
  } catch (error) {
    console.error('Account lookup failed.', { name: error?.name, message: error?.message })
    return response(error?.statusCode || 500, {
      message: error?.statusCode === 429
        ? error.message
        : 'We could not check that email. Please try again.',
    })
  }
}
