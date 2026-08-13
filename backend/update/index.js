import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const TABLE_NAME = process.env.TABLE_NAME || 'TripTrek'
const EDITABLE_ATTRIBUTES = new Set([
  'destination', 'startDate', 'endDate', 'itinerary', 'mapData', 'imageUrl',
])
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'PATCH,OPTIONS',
}
const response = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) })

export const handler = async (event) => {
  const claims = event?.requestContext?.authorizer?.jwt?.claims || {}
  const userId = claims.sub
  const tripId = event?.queryStringParameters?.tripId
  const ownerId = event?.queryStringParameters?.ownerId || userId
  if (!userId) return response(401, { message: 'Authentication is required.' })
  if (!tripId) return response(400, { message: 'A trip ID is required.' })

  let body
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body
  } catch {
    return response(400, { message: 'Invalid JSON body.' })
  }
  const legacyUpdate = body?.attributeName
    ? { [body.attributeName]: body.newValue }
    : null
  const updates = body?.updates || legacyUpdate
  const entries = updates && typeof updates === 'object' && !Array.isArray(updates)
    ? Object.entries(updates)
    : []
  if (!entries.length || entries.some(([name, value]) => (
    !EDITABLE_ATTRIBUTES.has(name) || typeof value === 'undefined'
  ))) {
    return response(400, { message: 'That trip field cannot be updated.' })
  }

  try {
    if (ownerId !== userId) {
      const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : ''
      if (!email) return response(403, { message: 'An email address is required for shared access.' })
      const invite = await db.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { pk: `INVITEE#${email}`, sk: `TRIP#${ownerId}#${tripId}` },
      }))
      if (!invite.Item || invite.Item.permission !== 'editor') {
        return response(403, { message: 'You do not have permission to edit this trip.' })
      }
    }

    const names = { '#version': 'version' }
    const values = {
      ':updatedAt': new Date().toISOString(),
      ':zero': 0,
      ':one': 1,
    }
    const assignments = entries.map(([name, value], index) => {
      names[`#field${index}`] = name
      values[`:value${index}`] = value
      return `#field${index} = :value${index}`
    })
    const expectedVersion = Number.isInteger(body?.expectedVersion) ? body.expectedVersion : null
    if (expectedVersion !== null) values[':expectedVersion'] = expectedVersion

    const result = await db.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: ownerId, sk: tripId },
      UpdateExpression: `SET ${assignments.join(', ')}, updatedAt = :updatedAt, #version = if_not_exists(#version, :zero) + :one`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ConditionExpression: expectedVersion === null
        ? 'attribute_exists(pk) AND attribute_exists(sk)'
        : 'attribute_exists(pk) AND attribute_exists(sk) AND (attribute_not_exists(#version) OR #version = :expectedVersion)',
      ReturnValues: 'UPDATED_NEW',
    }))
    return response(200, result.Attributes)
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      const current = await db.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { pk: ownerId, sk: tripId },
      }))
      return current.Item
        ? response(409, { message: 'This trip changed since you opened it. Refresh the trip and review the latest changes before saving again.' })
        : response(404, { message: 'Trip not found.' })
    }
    console.error('Error updating trip:', error)
    return response(500, { message: 'Unable to update the trip.' })
  }
}
