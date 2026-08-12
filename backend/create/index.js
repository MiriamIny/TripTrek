import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const TABLE_NAME = process.env.TABLE_NAME || 'TripTrek'
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
}

const response = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) })
const claimsFrom = (event) => event?.requestContext?.authorizer?.jwt?.claims || {}

export const handler = async (event) => {
  const claims = claimsFrom(event)
  const userId = claims.sub
  if (!userId) return response(401, { message: 'Authentication is required.' })

  let body
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body
  } catch {
    return response(400, { message: 'Invalid JSON format.' })
  }

  const { destination, startDate, endDate, imageUrl, id: tripId, itinerary = [] } = body || {}
  if (!tripId || !destination?.trim() || !startDate || !endDate) {
    return response(400, { message: 'Destination, dates, and a trip ID are required.' })
  }

  for (const day of itinerary) {
    for (const activity of day.activities || []) {
      if (!activity.name?.trim()) {
        return response(400, { message: 'Each activity must have a name.' })
      }
    }
  }

  const parseDate = (value) => {
    const match = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (!match) return null
    const [, month, day, year] = match
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
    return date.getUTCFullYear() === Number(year)
      && date.getUTCMonth() === Number(month) - 1
      && date.getUTCDate() === Number(day) ? date : null
  }
  const start = parseDate(startDate)
  const end = parseDate(endDate)
  if (!start || !end || end < start) {
    return response(400, { message: 'Enter a valid travel date range.' })
  }

  const key = { pk: userId, sk: tripId }
  try {
    const existing = await db.send(new GetCommand({ TableName: TABLE_NAME, Key: key }))
    if (existing.Item) return response(409, { message: 'Trip already exists.' })

    const now = new Date().toISOString()
    const item = {
      ...key,
      entityType: 'TRIP',
      ownerId: userId,
      destination: destination.trim(),
      startDate,
      endDate,
      itinerary,
      createdAt: now,
      updatedAt: now,
    }
    if (typeof claims.email === 'string') item.ownerEmail = claims.email.toLowerCase()
    if (claims.name) item.ownerName = claims.name
    if (imageUrl) item.imageUrl = imageUrl
    await db.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
      ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
    }))
    return response(201, { message: 'Trip created successfully.', tripId })
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      return response(409, { message: 'Trip already exists.' })
    }
    console.error('Error creating trip:', error)
    return response(500, { message: 'Unable to create the trip.' })
  }
}
