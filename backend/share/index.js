import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb'

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const TABLE_NAME = process.env.TABLE_NAME || 'TripTrek'
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
}
const response = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) })
const normalizeEmail = (value) => typeof value === 'string' ? value.trim().toLowerCase() : ''
const validEmail = (email) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
const tripKey = (ownerId, tripId) => `TRIP#${ownerId}#${tripId}`
const PERMISSIONS = new Set(['editor', 'viewer'])

const getOwnedTrip = (ownerId, tripId) => db.send(new GetCommand({
  TableName: TABLE_NAME,
  Key: { pk: ownerId, sk: tripId },
}))

export const handler = async (event) => {
  const claims = event?.requestContext?.authorizer?.jwt?.claims || {}
  const userId = claims.sub
  const callerEmail = normalizeEmail(claims.email)
  const method = event?.requestContext?.http?.method || event?.httpMethod
  if (!userId) return response(401, { message: 'Authentication is required.' })

  if (method === 'POST') {
    let body
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body
    } catch {
      return response(400, { message: 'Invalid JSON body.' })
    }
    const tripId = body?.tripId
    const email = normalizeEmail(body?.email)
    const permission = body?.permission || 'editor'
    if (!tripId || !validEmail(email)) {
      return response(400, { message: 'Enter a valid email address.' })
    }
    if (!PERMISSIONS.has(permission)) {
      return response(400, { message: 'Choose either Editor or Viewer access.' })
    }
    if (email === callerEmail) {
      return response(400, { message: 'This trip already belongs to you.' })
    }

    try {
      const trip = await getOwnedTrip(userId, tripId)
      if (!trip.Item) return response(404, { message: 'Trip not found.' })

      const createdAt = new Date().toISOString()
      const invite = {
        entityType: 'TRIP_INVITE',
        ownerId: userId,
        tripId,
        email,
        permission,
        createdAt,
      }
      if (claims.name || trip.Item.ownerName) invite.invitedByName = claims.name || trip.Item.ownerName
      if (callerEmail || trip.Item.ownerEmail) invite.invitedByEmail = callerEmail || trip.Item.ownerEmail
      await db.send(new TransactWriteCommand({ TransactItems: [
        {
          ConditionCheck: {
            TableName: TABLE_NAME,
            Key: { pk: userId, sk: tripId },
            ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
          },
        },
        {
          Put: {
            TableName: TABLE_NAME,
            Item: { ...invite, pk: `INVITEE#${email}`, sk: tripKey(userId, tripId) },
          },
        },
        {
          Put: {
            TableName: TABLE_NAME,
            Item: { ...invite, pk: tripKey(userId, tripId), sk: `COLLABORATOR#${email}` },
          },
        },
      ] }))
      return response(201, { ...invite })
    } catch (error) {
      console.error('Error sharing trip:', error)
      return response(500, { message: 'Unable to share the trip.' })
    }
  }

  const tripId = event?.queryStringParameters?.tripId
  if (!tripId) return response(400, { message: 'A trip ID is required.' })

  if (method === 'GET') {
    try {
      const trip = await getOwnedTrip(userId, tripId)
      if (!trip.Item) return response(403, { message: 'Only the trip owner can manage sharing.' })
      const result = await db.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :trip',
        ExpressionAttributeValues: { ':trip': tripKey(userId, tripId) },
      }))
      return response(200, (result.Items || []).map(({ email, permission, createdAt }) => ({
        email, permission, createdAt,
      })))
    } catch (error) {
      console.error('Error listing collaborators:', error)
      return response(500, { message: 'Unable to load collaborators.' })
    }
  }

  if (method === 'DELETE') {
    const requestedOwnerId = event?.queryStringParameters?.ownerId
    const leavingSharedTrip = requestedOwnerId && requestedOwnerId !== userId
    const ownerId = leavingSharedTrip ? requestedOwnerId : userId
    const email = leavingSharedTrip
      ? callerEmail
      : normalizeEmail(event?.queryStringParameters?.email)
    if (!validEmail(email)) return response(400, { message: 'A valid collaborator email is required.' })

    try {
      if (!leavingSharedTrip) {
        const trip = await getOwnedTrip(userId, tripId)
        if (!trip.Item) return response(403, { message: 'Only the trip owner can remove collaborators.' })
      }
      await db.send(new TransactWriteCommand({ TransactItems: [
        { Delete: { TableName: TABLE_NAME, Key: { pk: `INVITEE#${email}`, sk: tripKey(ownerId, tripId) } } },
        { Delete: { TableName: TABLE_NAME, Key: { pk: tripKey(ownerId, tripId), sk: `COLLABORATOR#${email}` } } },
      ] }))
      return response(200, { message: leavingSharedTrip ? 'You left the shared trip.' : 'Collaborator removed.' })
    } catch (error) {
      console.error('Error removing trip share:', error)
      return response(500, { message: 'Unable to update sharing.' })
    }
  }

  return response(405, { message: 'Method not allowed.' })
}
