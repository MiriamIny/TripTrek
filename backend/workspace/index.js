import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const TABLE_NAME = process.env.TABLE_NAME || 'TripTrek'
const LIST_FIELDS = new Set(['todos', 'packingItems'])
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,PATCH,OPTIONS',
}
const response = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) })
const workspaceKey = (ownerId, tripId) => ({ pk: ownerId, sk: `WORKSPACE#${tripId}` })

const normalizeList = (value, limit) => {
  if (!Array.isArray(value) || value.length > limit) return null
  const normalized = []
  const ids = new Set()
  for (const item of value) {
    const id = typeof item?.id === 'string' ? item.id.trim().slice(0, 80) : ''
    const text = typeof item?.text === 'string' ? item.text.trim().slice(0, 240) : ''
    if (!id || !text || ids.has(id)) return null
    ids.add(id)
    normalized.push({ id, text, completed: item.completed === true })
  }
  return normalized
}

const getAccess = async ({ userId, email, ownerId, tripId }) => {
  const trip = await db.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { pk: ownerId, sk: tripId },
  }))
  if (!trip.Item) return null
  if (ownerId === userId) return 'owner'
  if (!email) return null
  const invite = await db.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { pk: `INVITEE#${email}`, sk: `TRIP#${ownerId}#${tripId}` },
  }))
  return invite.Item?.permission || null
}

export const handler = async (event) => {
  const claims = event?.requestContext?.authorizer?.jwt?.claims || {}
  const userId = claims.sub
  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : ''
  const method = event?.requestContext?.http?.method || event?.httpMethod
  const tripId = event?.queryStringParameters?.tripId
  const ownerId = event?.queryStringParameters?.ownerId || userId

  if (!userId) return response(401, { message: 'Authentication is required.' })
  if (!tripId) return response(400, { message: 'A trip ID is required.' })

  try {
    const access = await getAccess({ userId, email, ownerId, tripId })
    if (!access) return response(404, { message: 'Trip not found.' })

    if (method === 'GET') {
      const result = await db.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: workspaceKey(ownerId, tripId),
      }))
      return response(200, {
        notes: result.Item?.notes || '',
        todos: result.Item?.todos || [],
        packingItems: result.Item?.packingItems || [],
        updatedAt: result.Item?.updatedAt || null,
      })
    }

    if (method === 'PATCH') {
      if (access === 'viewer') {
        return response(403, { message: 'You have view-only access to this trip.' })
      }

      let body
      try {
        body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body
      } catch {
        return response(400, { message: 'Invalid JSON body.' })
      }

      const updates = {}
      if (Object.hasOwn(body || {}, 'notes')) {
        if (typeof body.notes !== 'string' || body.notes.length > 12000) {
          return response(400, { message: 'Notes must be 12,000 characters or fewer.' })
        }
        updates.notes = body.notes
      }
      for (const field of LIST_FIELDS) {
        if (!Object.hasOwn(body || {}, field)) continue
        const normalized = normalizeList(body[field], field === 'todos' ? 100 : 200)
        if (!normalized) return response(400, { message: 'That checklist could not be saved.' })
        updates[field] = normalized
      }
      const entries = Object.entries(updates)
      if (!entries.length) return response(400, { message: 'Choose something to save.' })

      const names = { '#entityType': 'entityType' }
      const values = {
        ':entityType': 'TRIP_WORKSPACE',
        ':tripId': tripId,
        ':updatedAt': new Date().toISOString(),
      }
      const assignments = entries.map(([field, value], index) => {
        names[`#field${index}`] = field
        values[`:value${index}`] = value
        return `#field${index} = :value${index}`
      })
      const result = await db.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: workspaceKey(ownerId, tripId),
        UpdateExpression: `SET #entityType = :entityType, tripId = :tripId, updatedAt = :updatedAt, ${assignments.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      }))
      return response(200, {
        notes: result.Attributes?.notes || '',
        todos: result.Attributes?.todos || [],
        packingItems: result.Attributes?.packingItems || [],
        updatedAt: result.Attributes?.updatedAt || null,
      })
    }

    return response(405, { message: 'Method not allowed.' })
  } catch (error) {
    console.error('Error loading or saving trip workspace:', error)
    return response(500, { message: 'Unable to update the trip workspace.' })
  }
}
