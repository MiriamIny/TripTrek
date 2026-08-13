import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Chatbot from './Chatbot'
import { useTripContext } from '../../context/TripContext'
import { useAuth } from '../../context/AuthContext'
import { tripApiFetch } from '../../api/tripApi'

vi.mock('react-router-dom', () => ({ useLocation: () => ({ pathname: '/' }) }))
vi.mock('../../context/TripContext', () => ({ useTripContext: vi.fn() }))
vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../../api/tripApi', () => ({ tripApiFetch: vi.fn() }))

describe('Chatbot secure API integration', () => {
  const openAuth = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.scrollIntoView = vi.fn()
    useTripContext.mockReturnValue({ getTripById: vi.fn(() => null) })
    useAuth.mockReturnValue({
      isAuthenticated: true,
      userAttributes: { name: 'Miriam', email: 'miriam@example.com' },
      openAuth,
    })
  })

  it('sends chat messages through the authenticated TripTrek API', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    tripApiFetch.mockResolvedValue({
      json: vi.fn().mockResolvedValue({ reply: 'Pack comfortable walking shoes.' }),
    })
    render(<Chatbot />)

    fireEvent.click(screen.getByRole('button', { name: 'Open Trekka travel assistant' }))
    fireEvent.change(screen.getByLabelText('Ask Trekka a travel question'), {
      target: { value: 'What should I pack?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() => expect(tripApiFetch).toHaveBeenCalledTimes(1))
    expect(tripApiFetch.mock.calls[0][0]).toBe('chat')
    const request = JSON.parse(tripApiFetch.mock.calls[0][1].body)
    expect(request).toMatchObject({
      mode: 'chat',
      messages: expect.arrayContaining([
        { role: 'user', content: 'What should I pack?' },
      ]),
    })
    expect(JSON.stringify(request)).not.toContain('sk-')

    await act(async () => { vi.runAllTimers() })
    vi.useRealTimers()
  })

  it('asks signed-out users to sign in without calling the API', () => {
    useAuth.mockReturnValue({ isAuthenticated: false, userAttributes: {}, openAuth })
    render(<Chatbot />)

    fireEvent.click(screen.getByRole('button', { name: 'Open Trekka travel assistant' }))
    fireEvent.change(screen.getByLabelText('Ask Trekka a travel question'), {
      target: { value: 'Plan a weekend away' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    expect(openAuth).toHaveBeenCalledTimes(1)
    expect(tripApiFetch).not.toHaveBeenCalled()
    expect(screen.getByText(/Please sign in to chat with Trekka/)).toBeInTheDocument()
  })
})
