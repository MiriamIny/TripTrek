import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { BatchGetCommand, DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const TABLE_NAME = process.env.TABLE_NAME || 'TripTrek'
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
}
const response = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) })

const batchGetTrips = async (keys) => {
  const trips = []
  for (let index = 0; index < keys.length; index += 100) {
    const chunk = keys.slice(index, index + 100)
    const result = await db.send(new BatchGetCommand({
      RequestItems: { [TABLE_NAME]: { Keys: chunk } },
    }))
    trips.push(...(result.Responses?.[TABLE_NAME] || []))
  }
  return trips
}

export const handler = async (event) => {
  const claims = event?.requestContext?.authorizer?.jwt?.claims || {}
  const userId = claims.sub
  if (!userId) return response(401, { message: 'Authentication is required.' })

  try {
    const ownedResult = await db.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :owner',
      ExpressionAttributeValues: { ':owner': userId },
    }))
    const ownedTrips = (ownedResult.Items || [])
      .filter((item) => !item.entityType || item.entityType === 'TRIP')
      .map((trip) => ({ ...trip, ownerId: userId, access: 'owner' }))

    const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : ''
    if (!email) return response(200, ownedTrips)

    const inviteResult = await db.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :invitee',
      ExpressionAttributeValues: { ':invitee': `INVITEE#${email}` },
    }))
    const invites = (inviteResult.Items || []).filter((item) => item.entityType === 'TRIP_INVITE')
    const sharedTrips = await batchGetTrips(invites.map((invite) => ({
      pk: invite.ownerId,
      sk: invite.tripId,
    })))
    const tripByKey = new Map(sharedTrips.map((trip) => [`${trip.pk}#${trip.sk}`, trip]))
    const shared = invites.flatMap((invite) => {
      const trip = tripByKey.get(`${invite.ownerId}#${invite.tripId}`)
      return trip ? [{
        ...trip,
        ownerId: invite.ownerId,
        access: invite.permission || 'editor',
        sharedByName: invite.invitedByName || trip.ownerName,
        sharedByEmail: invite.invitedByEmail || trip.ownerEmail,
      }] : []
    })

    return response(200, [...ownedTrips, ...shared])
  } catch (error) {
    console.error('Error retrieving trips:', error)
    return response(500, { message: 'Unable to retrieve trips.' })
  }
}
