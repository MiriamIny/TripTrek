import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { BatchWriteCommand, DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const TABLE_NAME = process.env.TABLE_NAME || 'TripTrek'
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'DELETE,OPTIONS',
}
const response = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) })

const deleteKeys = async (keys) => {
  for (let index = 0; index < keys.length; index += 25) {
    let requests = keys.slice(index, index + 25).map((Key) => ({ DeleteRequest: { Key } }))
    do {
      const result = await db.send(new BatchWriteCommand({
        RequestItems: { [TABLE_NAME]: requests },
      }))
      requests = result.UnprocessedItems?.[TABLE_NAME] || []
    } while (requests.length)
  }
}

export const handler = async (event) => {
  const claims = event?.requestContext?.authorizer?.jwt?.claims || {}
  const userId = claims.sub
  const tripId = event?.queryStringParameters?.tripId
  if (!userId) return response(401, { message: 'Authentication is required.' })
  if (!tripId) return response(400, { message: 'A trip ID is required.' })

  try {
    const trip = await db.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: userId, sk: tripId },
    }))
    if (!trip.Item) return response(404, { message: 'Trip not found.' })

    const shareResult = await db.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :trip',
      ExpressionAttributeValues: { ':trip': `TRIP#${userId}#${tripId}` },
    }))
    const shareRows = shareResult.Items || []
    const keys = [
      { pk: userId, sk: tripId },
      ...shareRows.flatMap((share) => [
        { pk: share.pk, sk: share.sk },
        { pk: `INVITEE#${share.email}`, sk: `TRIP#${userId}#${tripId}` },
      ]),
    ]
    await deleteKeys(keys)
    return response(200, { message: 'Trip deleted successfully.' })
  } catch (error) {
    console.error('Error deleting trip:', error)
    return response(500, { message: 'Unable to delete the trip.' })
  }
}
