import { createHash } from 'node:crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb'
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const ses = new SESv2Client({})
const TABLE_NAME = process.env.TABLE_NAME || 'TripTrek'
const SENDER_EMAIL = process.env.SES_SENDER_EMAIL || 'hello@trekatrip.com'
const APP_BASE_URL = (process.env.APP_BASE_URL || 'https://www.trekatrip.com').replace(/\/$/, '')
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
}
const response = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) })
const normalizeEmail = (value) => typeof value === 'string' ? value.trim().toLowerCase() : ''
const validEmail = (email) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
const normalizeMessage = (value) => typeof value === 'string' ? value.trim() : ''
const tripKey = (ownerId, tripId) => `TRIP#${ownerId}#${tripId}`
const PERMISSIONS = new Set(['editor', 'viewer'])
const accountKey = (email) => `ACCOUNT#${createHash('sha256').update(email).digest('hex')}`
const escapeHtml = (value) => String(value || '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

const getOwnedTrip = (ownerId, tripId) => db.send(new GetCommand({
  TableName: TABLE_NAME,
  Key: { pk: ownerId, sk: tripId },
}))

const canManageOwnerId = async (claims, ownerId) => {
  if (ownerId === claims.sub) return true
  const email = normalizeEmail(claims.email)
  const verified = claims.email_verified === true || claims.email_verified === 'true'
  if (!email || !verified) return false
  const account = await db.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { pk: accountKey(email), sk: 'AUTH' },
    ConsistentRead: true,
  }))
  return Array.isArray(account.Item?.ownerIds) && account.Item.ownerIds.includes(ownerId)
}

const sendInvitation = ({
  email,
  permission,
  trip,
  inviterName,
  inviterEmail,
  invitationMessage,
}) => {
  const destination = trip.destination || 'a trip'
  const inviter = inviterName || inviterEmail || 'Someone'
  const accessDescription = permission === 'editor'
    ? 'view and edit the itinerary'
    : 'view the itinerary'
  const tripUrl = `${APP_BASE_URL}/trips`
  const dates = trip.startDate && trip.endDate
    ? `${trip.startDate} – ${trip.endDate}`
    : ''
  const messageText = invitationMessage
    ? `\n\nA note from ${inviter}:\n${invitationMessage}`
    : ''
  const messageHtml = invitationMessage
    ? `<div style="margin:20px 0;padding:16px 18px;background:#f6f3ee;border-left:4px solid #e7765b;border-radius:8px"><p style="margin:0 0 8px;color:#647477;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">A note from ${escapeHtml(inviter)}</p><p style="margin:0;line-height:1.55;white-space:pre-wrap">${escapeHtml(invitationMessage)}</p></div>`
    : ''

  return ses.send(new SendEmailCommand({
    FromEmailAddress: `Trek A Trip <${SENDER_EMAIL}>`,
    Destination: { ToAddresses: [email] },
    ReplyToAddresses: inviterEmail ? [inviterEmail] : undefined,
    Content: {
      Simple: {
        Subject: { Data: `${inviter} invited you to ${destination}`, Charset: 'UTF-8' },
        Body: {
          Text: {
            Data: `${inviter} invited you to collaborate on ${destination} in Trek A Trip.\n${dates ? `${dates}\n` : ''}You can ${accessDescription}.${messageText}\n\nOpen trip: ${tripUrl}\n\nSign in or create an account using ${email} to access the trip.`,
            Charset: 'UTF-8',
          },
          Html: {
            Data: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#263b3d"><div style="padding:24px;background:#0d5427;color:#fff;border-radius:16px 16px 0 0"><strong style="font-size:22px">Trek A Trip</strong></div><div style="padding:28px;border:1px solid #dfe7e2;border-top:0;border-radius:0 0 16px 16px"><p style="color:#e7765b;font-weight:700;text-transform:uppercase;letter-spacing:.08em">Trip invitation</p><h1 style="font-size:26px;margin:8px 0 16px">You’re invited to ${escapeHtml(destination)}</h1><p><strong>${escapeHtml(inviter)}</strong> invited you to ${escapeHtml(accessDescription)}.</p>${dates ? `<p style="color:#647477">${escapeHtml(dates)}</p>` : ''}${messageHtml}<a href="${tripUrl}" style="display:inline-block;margin:14px 0;padding:12px 20px;background:#167b35;color:#fff;text-decoration:none;border-radius:9px;font-weight:700">View trip</a><p style="font-size:13px;color:#647477">Sign in or create an account using <strong>${escapeHtml(email)}</strong> to access this trip.</p></div></div>`,
            Charset: 'UTF-8',
          },
        },
      },
    },
  }))
}

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
    const ownerId = body?.ownerId || userId
    const email = normalizeEmail(body?.email)
    const permission = body?.permission || 'editor'
    const sendEmail = body?.sendEmail !== false
    const invitationMessage = normalizeMessage(body?.invitationMessage)
    if (!tripId || !validEmail(email)) {
      return response(400, { message: 'Enter a valid email address.' })
    }
    if (!PERMISSIONS.has(permission)) {
      return response(400, { message: 'Choose either Editor or Viewer access.' })
    }
    if (invitationMessage.length > 500) {
      return response(400, { message: 'Keep the invitation message to 500 characters or fewer.' })
    }
    if (email === callerEmail) {
      return response(400, { message: 'This trip already belongs to you.' })
    }

    try {
      if (!(await canManageOwnerId(claims, ownerId))) {
        return response(403, { message: 'Only the trip owner can manage sharing.' })
      }
      const trip = await getOwnedTrip(ownerId, tripId)
      if (!trip.Item) return response(404, { message: 'Trip not found.' })

      const createdAt = new Date().toISOString()
      const invite = {
        entityType: 'TRIP_INVITE',
        ownerId,
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
            Key: { pk: ownerId, sk: tripId },
            ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
          },
        },
        {
          Put: {
            TableName: TABLE_NAME,
            Item: { ...invite, pk: `INVITEE#${email}`, sk: tripKey(ownerId, tripId) },
          },
        },
        {
          Put: {
            TableName: TABLE_NAME,
            Item: { ...invite, pk: tripKey(ownerId, tripId), sk: `COLLABORATOR#${email}` },
          },
        },
      ] }))
      let invitationEmailSent = false
      if (sendEmail) {
        try {
          await sendInvitation({
            email,
            permission,
            trip: trip.Item,
            inviterName: invite.invitedByName,
            inviterEmail: invite.invitedByEmail,
            invitationMessage,
          })
          invitationEmailSent = true
        } catch (emailError) {
          console.error('Trip access was added, but the invitation email failed:', {
            name: emailError.name,
            message: emailError.message,
          })
        }
      }
      return response(201, { ...invite, invitationEmailSent })
    } catch (error) {
      console.error('Error sharing trip:', error)
      return response(500, { message: 'Unable to share the trip.' })
    }
  }

  const tripId = event?.queryStringParameters?.tripId
  const requestedOwnerId = event?.queryStringParameters?.ownerId
  const managedOwnerId = requestedOwnerId || userId
  if (!tripId) return response(400, { message: 'A trip ID is required.' })

  if (method === 'GET') {
    try {
      if (!(await canManageOwnerId(claims, managedOwnerId))) {
        return response(403, { message: 'Only the trip owner can manage sharing.' })
      }
      const trip = await getOwnedTrip(managedOwnerId, tripId)
      if (!trip.Item) return response(403, { message: 'Only the trip owner can manage sharing.' })
      const result = await db.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :trip',
        ExpressionAttributeValues: { ':trip': tripKey(managedOwnerId, tripId) },
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
    const ownsRequestedId = await canManageOwnerId(claims, managedOwnerId)
    const leavingSharedTrip = requestedOwnerId && !ownsRequestedId
    const ownerId = requestedOwnerId || userId
    const email = leavingSharedTrip
      ? callerEmail
      : normalizeEmail(event?.queryStringParameters?.email)
    if (!validEmail(email)) return response(400, { message: 'A valid collaborator email is required.' })

    try {
      if (!leavingSharedTrip) {
        const trip = await getOwnedTrip(ownerId, tripId)
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
