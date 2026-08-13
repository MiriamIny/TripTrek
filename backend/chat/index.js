import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'

const secrets = new SecretsManagerClient({})
const SECRET_ID = process.env.OPENAI_SECRET_ID || 'TripTrek/openai'
const MODEL = process.env.OPENAI_MODEL || 'ft:gpt-3.5-turbo-0125:personal:trekka:C1G5p4GH'
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const MAX_MESSAGES = 12
const MAX_MESSAGE_LENGTH = 2000
const SECRET_CACHE_MILLISECONDS = 5 * 60 * 1000
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Content-Type': 'application/json',
}
const response = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) })

let apiKeyPromise
let apiKeyExpiresAt = 0

const readApiKey = async () => {
  const result = await secrets.send(new GetSecretValueCommand({ SecretId: SECRET_ID }))
  const secretValue = result.SecretString
    || Buffer.from(result.SecretBinary || '').toString('utf8')

  if (!secretValue) throw new Error('The OpenAI secret is empty.')

  try {
    const parsed = JSON.parse(secretValue)
    const key = parsed.OPENAI_API_KEY || parsed.apiKey
    if (!key || typeof key !== 'string') throw new Error('The OpenAI key is missing.')
    return key.trim()
  } catch (error) {
    if (error instanceof SyntaxError) return secretValue.trim()
    throw error
  }
}

const getApiKey = async () => {
  if (!apiKeyPromise || Date.now() >= apiKeyExpiresAt) {
    apiKeyExpiresAt = Date.now() + SECRET_CACHE_MILLISECONDS
    apiKeyPromise = readApiKey().catch((error) => {
      apiKeyPromise = null
      apiKeyExpiresAt = 0
      throw error
    })
  }
  return apiKeyPromise
}

const cleanText = (value, maxLength = MAX_MESSAGE_LENGTH) => (
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
)

const cleanTrip = (value) => {
  if (!value || typeof value !== 'object') return null
  const destination = cleanText(value.destination, 120)
  const itinerary = Array.isArray(value.itinerary)
    ? value.itinerary.slice(0, 31).map((day) => ({
      date: cleanText(day?.date, 30),
      activities: Array.isArray(day?.activities)
        ? day.activities.slice(0, 30).map((activity) => ({
          time: cleanText(activity?.time, 30),
          name: cleanText(activity?.name, 300),
        })).filter((activity) => activity.name)
        : [],
    }))
    : []
  return destination ? { destination, itinerary } : null
}

const cleanMessages = (value) => (
  Array.isArray(value) ? value.slice(-MAX_MESSAGES).flatMap((message) => {
    const role = message?.role === 'assistant' ? 'assistant' : message?.role === 'user' ? 'user' : null
    const content = cleanText(message?.content)
    return role && content ? [{ role, content }] : []
  }) : []
)

const callOpenAI = async (messages, maxTokens = 500) => {
  const apiKey = await getApiKey()
  const openAIResponse = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.7,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(28000),
  })

  const requestId = openAIResponse.headers.get('x-request-id')
  const payload = await openAIResponse.json().catch(() => ({}))
  if (!openAIResponse.ok) {
    console.error('OpenAI request failed', {
      status: openAIResponse.status,
      requestId,
      type: payload?.error?.type,
      code: payload?.error?.code,
    })
    throw new Error('The travel assistant is temporarily unavailable.')
  }

  const text = payload?.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('The travel assistant returned an empty response.')
  }
  return text.trim()
}

const parseJsonReply = (text) => {
  const withoutFence = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const firstBrace = withoutFence.indexOf('{')
  const lastBrace = withoutFence.lastIndexOf('}')
  if (firstBrace < 0 || lastBrace <= firstBrace) return {}
  return JSON.parse(withoutFence.slice(firstBrace, lastBrace + 1))
}

export const handler = async (event) => {
  const claims = event?.requestContext?.authorizer?.jwt?.claims || {}
  const method = event?.requestContext?.http?.method || event?.httpMethod
  if (!claims.sub) return response(401, { message: 'Authentication is required.' })
  if (method !== 'POST') return response(405, { message: 'Method not allowed.' })

  let body
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body
  } catch {
    return response(400, { message: 'Invalid JSON body.' })
  }

  const mode = body?.mode === 'followup' ? 'followup' : 'chat'
  const trip = cleanTrip(body?.trip)
  const today = new Date().toISOString().slice(0, 10)

  try {
    if (mode === 'followup') {
      if (!trip) return response(400, { message: 'Trip details are required.' })
      const reply = await callOpenAI([
        {
          role: 'system',
          content: `You are Trekka, Trek a Trip's friendly travel assistant. Give one short, helpful follow-up message and exactly three concise suggestion prompts. Respond only as valid JSON in this format: {"followup":"text","suggestions":["one","two","three"]}. Today's date is ${today}.`,
        },
        {
          role: 'user',
          content: `I'm planning a trip to ${trip.destination}. Here's my itinerary: ${JSON.stringify(trip.itinerary)}`,
        },
      ], 350)
      const parsed = parseJsonReply(reply)
      const followup = cleanText(parsed.followup, 1000)
      const suggestions = Array.isArray(parsed.suggestions)
        ? parsed.suggestions.map((item) => cleanText(item, 160)).filter(Boolean).slice(0, 3)
        : []
      if (!followup) throw new Error('The travel assistant returned an invalid follow-up.')
      return response(200, { followup, suggestions })
    }

    const messages = cleanMessages(body?.messages)
    if (!messages.length || !messages.some((message) => message.role === 'user')) {
      return response(400, { message: 'A message is required.' })
    }
    const tripContext = trip
      ? ` The user is planning a trip to ${trip.destination}. Their itinerary is: ${JSON.stringify(trip.itinerary)}.`
      : ''
    const reply = await callOpenAI([
      {
        role: 'system',
        content: `You are Trekka, Trek a Trip's friendly travel assistant. Give concise, practical travel-planning help. Keep the answer focused and under 300 words.${tripContext}`,
      },
      ...messages,
    ])
    return response(200, { reply })
  } catch (error) {
    console.error('Trekka request error:', error.name, error.message)
    return response(502, { message: 'Trekka hit a little turbulence. Please try again in a moment.' })
  }
}
