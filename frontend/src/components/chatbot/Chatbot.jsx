import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useTripContext } from '../../context/TripContext'
import { useAuth } from '../../context/AuthContext'
import { tripApiFetch } from '../../api/tripApi'
import './Chatbot.css'

const DEFAULT_SUGGESTIONS = [
  'Find me a budget-friendly getaway',
  'Show me underrated travel spots',
  'Surprise me with a destination',
]
const INTRO_MESSAGE = "Hi! I'm Trekka, your travel-planning assistant. Ask me where to go, what to pack, or how to shape your itinerary."

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m4 4 17 8-17 8 3.2-8L4 4Z" />
      <path d="M7.2 12H21" />
    </svg>
  )
}

const Chatbot = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [streamedMessage, setStreamedMessage] = useState('')
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [hasNotification, setHasNotification] = useState(false)
  const [hasShownIntro, setHasShownIntro] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const streamTimerRef = useRef(null)
  const followupTripRef = useRef(null)
  const location = useLocation()
  const { getTripById } = useTripContext()
  const { isAuthenticated, userAttributes, openAuth } = useAuth()

  const tripId = location.pathname.match(/^\/trips\/([^/]+)/)?.[1] || null
  const tripData = tripId ? getTripById(tripId) : null
  const profilePicture = isAuthenticated && typeof userAttributes?.picture === 'string'
    ? userAttributes.picture
    : ''
  const fullProfileName = isAuthenticated && typeof userAttributes?.name === 'string'
    ? userAttributes.name.trim()
    : ''
  const profileName = fullProfileName ? fullProfileName.split(/\s+/)[0] : 'You'
  const profileInitial = isAuthenticated
    ? (profileName !== 'You' ? profileName : userAttributes?.email || 'You').trim().charAt(0).toUpperCase()
    : 'You'

  const showIntro = () => {
    if (hasShownIntro || messages.length > 0) return
    setMessages([{ sender: 'bot', text: INTRO_MESSAGE }])
    setSuggestions(DEFAULT_SUGGESTIONS)
    setHasShownIntro(true)
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamedMessage, suggestions])

  useEffect(() => {
    if (location.pathname.includes('/trips') && !hasShownIntro && messages.length === 0) {
      setMessages([{ sender: 'bot', text: INTRO_MESSAGE }])
      setSuggestions(DEFAULT_SUGGESTIONS)
      setHasShownIntro(true)
      if (!isOpen) setHasNotification(true)
    }
  }, [hasShownIntro, isOpen, location.pathname, messages.length])

  useEffect(() => {
    if (!isOpen) return
    setHasNotification(false)
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 180)
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  useEffect(() => () => window.clearInterval(streamTimerRef.current), [])

  useEffect(() => {
    const currentTripKey = tripData?.id || tripData?.sk
    if (!isAuthenticated || !hasShownIntro || !tripData || !currentTripKey
      || followupTripRef.current === currentTripKey) return
    followupTripRef.current = currentTripKey

    const generateFollowup = async () => {
      try {
        const response = await tripApiFetch('chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            mode: 'followup',
            trip: {
              destination: tripData.destination,
              itinerary: tripData.itinerary,
            },
          }),
        })
        const data = await response.json()
        if (data.followup) setMessages((previous) => [...previous, { sender: 'bot', text: data.followup }])
        if (data.suggestions?.length) setSuggestions(data.suggestions)
        if (!isOpen) setHasNotification(true)
      } catch (error) {
        console.error('Error generating AI follow-up:', error)
      }
    }

    generateFollowup()
  }, [hasShownIntro, isAuthenticated, isOpen, tripData])

  const toggleChat = () => {
    if (!isOpen) showIntro()
    setIsOpen((open) => !open)
  }

  const sendMessage = async (text) => {
    const trimmedText = text.trim()
    if (!trimmedText || isTyping) return
    if (!isAuthenticated) {
      setMessages((previous) => [...previous, {
        sender: 'bot',
        text: 'Please sign in to chat with Trekka and keep your travel planning secure.',
      }])
      openAuth()
      return
    }

    const newMessages = [...messages, { sender: 'user', text: trimmedText }]
    setMessages(newMessages)
    setSuggestions([])
    setInput('')
    setIsTyping(true)

    try {
      const response = await tripApiFetch('chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'chat',
          messages: newMessages.map((message) => ({
            role: message.sender === 'user' ? 'user' : 'assistant',
            content: message.text,
          })),
          trip: tripData ? {
            destination: tripData.destination,
            itinerary: tripData.itinerary,
          } : null,
        }),
      })

      const data = await response.json()
      const botReply = data.reply?.trim()
      if (!botReply) throw new Error('Trekka returned an empty response.')

      const words = botReply.split(/\s+/)
      let wordIndex = 0
      setStreamedMessage('')
      window.clearInterval(streamTimerRef.current)
      streamTimerRef.current = window.setInterval(() => {
        wordIndex += 1
        setStreamedMessage(words.slice(0, wordIndex).join(' '))
        if (wordIndex >= words.length) {
          window.clearInterval(streamTimerRef.current)
          setMessages((previous) => [...previous, { sender: 'bot', text: botReply }])
          setStreamedMessage('')
          setIsTyping(false)
          if (!isOpen) setHasNotification(true)
        }
      }, 55)
    } catch (error) {
      console.error('Error contacting Trekka:', error)
      setMessages((previous) => [...previous, {
        sender: 'bot',
        text: 'I hit a little turbulence. Please try again in a moment.',
      }])
      setIsTyping(false)
      if (!isOpen) setHasNotification(true)
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    sendMessage(input)
  }

  const handleComposerKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div className="trekka-chat">
      <section
        id="trekka-chat-panel"
        className={`trekka-panel ${isOpen ? 'trekka-panel--open' : ''}`}
        role="dialog"
        aria-modal="false"
        aria-labelledby="trekka-title"
        aria-hidden={!isOpen}
      >
        <header className="trekka-header">
          <span className="trekka-header-mark" aria-hidden="true">
            <img src="/trek-a-trip.svg" alt="" />
          </span>
          <div className="trekka-header-copy">
            <div className="trekka-title-row">
              <h2 id="trekka-title">trekka</h2>
            </div>
            <p>YOUR TRAVEL-PLANNING COMPANION</p>
          </div>
          <button type="button" className="trekka-close" onClick={() => setIsOpen(false)} aria-label="Close trekka">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </header>

        {tripData && (
          <div className="trekka-trip-context">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 21s6-5.6 6-11a6 6 0 1 0-12 0c0 5.4 6 11 6 11Z" />
              <circle cx="12" cy="10" r="2" />
            </svg>
            <span>Helping with <strong>{tripData.destination}</strong></span>
          </div>
        )}

        <div className="trekka-messages" role="log" aria-live="polite" aria-relevant="additions">
          {messages.map((message, index) => (
            <div key={`${message.sender}-${index}`} className={`trekka-message trekka-message--${message.sender}`}>
              <span className="trekka-avatar" aria-hidden="true">
                {message.sender === 'user' ? (
                  profilePicture
                    ? <img className="trekka-user-photo" src={profilePicture} alt="" referrerPolicy="no-referrer" />
                    : profileInitial
                ) : <img src="/trek-a-trip.svg" alt="" />}
              </span>
              <div className="trekka-message-body">
                <span className="trekka-message-name">{message.sender === 'user' ? profileName : 'trekka'}</span>
                <p>{message.text}</p>
              </div>
            </div>
          ))}

          {streamedMessage && (
            <div className="trekka-message trekka-message--bot">
              <span className="trekka-avatar" aria-hidden="true"><img src="/trek-a-trip.svg" alt="" /></span>
              <div className="trekka-message-body">
                <span className="trekka-message-name">trekka</span>
                <p>{streamedMessage}</p>
              </div>
            </div>
          )}

          {isTyping && !streamedMessage && (
            <div className="trekka-message trekka-message--bot" aria-label="trekka is thinking">
              <span className="trekka-avatar" aria-hidden="true"><img src="/trek-a-trip.svg" alt="" /></span>
              <div className="trekka-typing" aria-hidden="true"><i /><i /><i /></div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {suggestions.length > 0 && (
          <div className="trekka-suggestions" aria-label="Suggested questions">
            <span>Try asking</span>
            <div>
              {suggestions.map((suggestion) => (
                <button
                  type="button"
                  key={suggestion}
                  onClick={() => sendMessage(suggestion)}
                  disabled={isTyping}
                >
                  {suggestion}
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
                </button>
              ))}
            </div>
          </div>
        )}

        <footer className="trekka-composer-wrap">
          <form className="trekka-composer" onSubmit={handleSubmit}>
            <label htmlFor="trekka-input" className="trekka-visually-hidden">Ask Trekka a travel question</label>
            <textarea
              ref={inputRef}
              id="trekka-input"
              rows="1"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Ask Trekka anything…"
              disabled={isTyping}
            />
            <button type="submit" disabled={!input.trim() || isTyping} aria-label="Send message">
              <SendIcon />
            </button>
          </form>
          <p>Trekka can make mistakes. Double-check important travel details.</p>
        </footer>
      </section>

      <button
        type="button"
        className={`trekka-toggle ${hasNotification ? 'trekka-toggle--notification' : ''}`}
        onClick={toggleChat}
        aria-label={isOpen ? 'Close Trekka travel assistant' : 'Open Trekka travel assistant'}
        aria-expanded={isOpen}
        aria-controls="trekka-chat-panel"
      >
        {isOpen ? (
          <svg className="trekka-toggle-close" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        ) : (
          <>
            <svg className="trekka-toggle-chat" viewBox="0 0 32 32" aria-hidden="true">
              <path d="M6 7.5h20v15H14l-6 4v-4H6v-15Z" />
              <path d="M11 13h10M11 17h7" />
            </svg>
            <span className="trekka-toggle-spark" aria-hidden="true">✦</span>
          </>
        )}
        {hasNotification && !isOpen && <span className="trekka-badge"><span className="trekka-visually-hidden">New message</span></span>}
      </button>
    </div>
  )
}

export default Chatbot
