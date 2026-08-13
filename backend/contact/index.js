import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb'

const ses = new SESv2Client({})
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const SENDER_EMAIL = process.env.SES_SENDER_EMAIL || 'hello@trekatrip.com'
const RECIPIENT_EMAIL = process.env.CONTACT_RECIPIENT_EMAIL || ''
const RATE_LIMIT_TABLE = process.env.RATE_LIMIT_TABLE || ''
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
}
const response = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) })
const normalize = (value) => typeof value === 'string' ? value.trim() : ''
const validEmail = (email) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
const TOPICS = {
  planning: 'Trip planning',
  account: 'Account and sign-in',
  feedback: 'Feedback or an idea',
  other: 'Something else',
}
const escapeHtml = (value) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')
const clientIp = (event) => event?.requestContext?.http?.sourceIp
  || event?.requestContext?.identity?.sourceIp
  || 'unknown'

const checkRateLimit = async (event) => {
  if (!RATE_LIMIT_TABLE) return true
  const now = Math.floor(Date.now() / 1000)
  const windowStart = Math.floor(now / 3600) * 3600
  try {
    await db.send(new UpdateCommand({
      TableName: RATE_LIMIT_TABLE,
      Key: { rateKey: `${clientIp(event)}#${windowStart}` },
      UpdateExpression: 'SET expiresAt = :expiresAt ADD requestCount :one',
      ConditionExpression: 'attribute_not_exists(requestCount) OR requestCount < :limit',
      ExpressionAttributeValues: {
        ':one': 1,
        ':limit': 5,
        ':expiresAt': now + 7200,
      },
    }))
    return true
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') return false
    throw error
  }
}

export const handler = async (event = {}) => {
  const method = event?.requestContext?.http?.method || event?.httpMethod
  if (method === 'OPTIONS') return response(204, {})
  if (method !== 'POST') return response(405, { message: 'Method not allowed.' })

  let body
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body
  } catch {
    return response(400, { message: 'Invalid request.' })
  }

  const name = normalize(body?.name)
  const email = normalize(body?.email).toLowerCase()
  const subject = normalize(body?.subject)
  const message = normalize(body?.message)

  // A hidden field catches basic form bots without inconveniencing real visitors.
  if (normalize(body?.website)) return response(202, { message: 'Thanks! Your message has been sent.' })
  if (!name || name.length > 100 || !validEmail(email) || !TOPICS[subject]
    || message.length < 10 || message.length > 1500) {
    return response(400, { message: 'Complete every field and enter a message of at least 10 characters.' })
  }
  if (!RECIPIENT_EMAIL) {
    console.error('CONTACT_RECIPIENT_EMAIL is not configured')
    return response(503, { message: 'Contact messaging is temporarily unavailable.' })
  }

  try {
    if (!await checkRateLimit(event)) {
      return response(429, { message: 'Too many messages were sent from this connection. Please try again later.' })
    }
  } catch (error) {
    console.error('Unable to check contact rate limit:', { name: error.name, message: error.message })
    return response(503, { message: 'Contact messaging is temporarily unavailable.' })
  }

  const safeName = escapeHtml(name)
  const safeEmail = escapeHtml(email)
  const safeTopic = escapeHtml(TOPICS[subject])
  const safeMessage = escapeHtml(message).replaceAll('\n', '<br>')

  try {
    await ses.send(new SendEmailCommand({
      FromEmailAddress: `Trek A Trip <${SENDER_EMAIL}>`,
      Destination: { ToAddresses: [RECIPIENT_EMAIL] },
      ReplyToAddresses: [email],
      Content: {
        Simple: {
          Subject: { Data: `[Trek A Trip] ${TOPICS[subject]}`, Charset: 'UTF-8' },
          Body: {
            Text: {
              Data: `New Trek A Trip contact message\n\nName: ${name}\nEmail: ${email}\nTopic: ${TOPICS[subject]}\n\n${message}`,
              Charset: 'UTF-8',
            },
            Html: {
              Data: `<h2>New Trek A Trip contact message</h2><p><strong>Name:</strong> ${safeName}<br><strong>Email:</strong> ${safeEmail}<br><strong>Topic:</strong> ${safeTopic}</p><p>${safeMessage}</p>`,
              Charset: 'UTF-8',
            },
          },
        },
      },
    }))
    return response(202, { message: 'Thanks! Your message has been sent.' })
  } catch (error) {
    console.error('Unable to send contact email:', { name: error.name, message: error.message })
    return response(502, { message: 'We could not send your message. Please try again in a moment.' })
  }
}
