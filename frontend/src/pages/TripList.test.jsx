// src/pages/TripList.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useNavigate } from 'react-router-dom'
import TripList from './TripList'
import { useTripContext } from '../context/TripContext'
import { useAuth } from '../context/AuthContext'

// Mocking dependencies
vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(),
}))
vi.mock('../context/TripContext', () => ({
  useTripContext: vi.fn(),
}))
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))
vi.mock('../components/TripForm', () => ({
  default: ({ onSave, onCancel }) => (
    <div>
      <button onClick={() => onSave({ destination: 'Test', startDate: '01/01/2023', endDate: '01/10/2023', itinerary: [] })}>Save Trip</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  )
}))

describe('TripList', () => {
  const mockNavigate = vi.fn()
  const mockFetchTrips = vi.fn()
  const mockSaveTrip = vi.fn()
  const mockDeleteTrip = vi.fn()

  const defaultContextValue = {
    trips: [],
    loading: false,
    error: null,
    deleteTrip: mockDeleteTrip,
    saveTrip: mockSaveTrip,
    fetchTrips: mockFetchTrips,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    useNavigate.mockReturnValue(mockNavigate)
    useTripContext.mockReturnValue(defaultContextValue)
    useAuth.mockReturnValue({
      isAuthenticated: true,
      authStatus: 'authenticated',
      openAuth: vi.fn(),
    })
  })

  it('prompts guests to sign in without fetching trips', () => {
    const openAuth = vi.fn()
    useAuth.mockReturnValue({
      isAuthenticated: false,
      authStatus: 'unauthenticated',
      openAuth,
    })

    render(<TripList />)

    expect(screen.getByText(/Sign in to create new trips/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /sign in or create account/i }))
    expect(openAuth).toHaveBeenCalledTimes(1)
    expect(mockFetchTrips).not.toHaveBeenCalled()
  })

  it('should render loading state correctly', () => {
    useTripContext.mockReturnValue({
      ...defaultContextValue,
      loading: true,
    })

    render(<TripList />)

    expect(screen.getByText('Loading your trips…')).toBeInTheDocument()
  })

  it('should render error state correctly', () => {
    useTripContext.mockReturnValue({
      ...defaultContextValue,
      error: 'Error message',
    })

    render(<TripList />)

    expect(screen.getByRole('heading', { name: /we couldn’t load your trips/i })).toBeInTheDocument()
    expect(screen.getByText('Error message')).toBeInTheDocument()
  })

  it('should render empty list state correctly', () => {
    render(<TripList />)

    expect(screen.getByRole('heading', { name: /your next adventure starts here/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /plan your first trip/i })).toBeInTheDocument()
  })

  it('should fetch trips on mount', () => {
    render(<TripList />)

    expect(mockFetchTrips).toHaveBeenCalled()
  })

  it('should show TripForm when the empty-state action is clicked', () => {
    render(<TripList />)

    fireEvent.click(screen.getByRole('button', { name: /plan your first trip/i }))

    expect(screen.getByText('Save Trip')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /create a new trip/i })).toBeInTheDocument()
  })

  it('should handle saving a trip', async () => {
    render(<TripList />)

    fireEvent.click(screen.getByRole('button', { name: /plan your first trip/i }))
    fireEvent.click(screen.getByText('Save Trip'))

    await waitFor(() => expect(mockSaveTrip).toHaveBeenCalledWith({
      destination: 'Test',
      startDate: '01/01/2023',
      endDate: '01/10/2023',
      itinerary: [],
    }))
  })

  it('should handle canceling trip creation', () => {
    render(<TripList />)

    fireEvent.click(screen.getByRole('button', { name: /plan your first trip/i }))
    fireEvent.click(screen.getByText('Cancel'))

    expect(screen.queryByText('Save Trip')).not.toBeInTheDocument()
  })

  it('should navigate to the correct trip page on trip click', () => {
    useTripContext.mockReturnValue({
      ...defaultContextValue,
      trips: [{ id: 1, destination: 'Test', startDate: '01/01/2023', endDate: '01/10/2023' }],
    })

    render(<TripList />)

    fireEvent.click(screen.getByRole('button', { name: /view trip to test/i }))

    expect(mockNavigate).toHaveBeenCalledWith('/trips/1')
  })

  it('renders saved-trip details with readable dates and activity totals', () => {
    useTripContext.mockReturnValue({
      ...defaultContextValue,
      trips: [
        {
          id: 1,
          destination: 'Lisbon',
          startDate: '05/10/2027',
          endDate: '05/14/2027',
          itinerary: [
            { date: '05/10/2027', activities: [{ name: 'Tram ride' }, { name: 'Dinner' }] },
            { date: '05/11/2027', activities: [{ name: 'Museum' }] },
          ],
        },
      ],
    })

    render(<TripList />)

    expect(screen.getByRole('heading', { name: /all trips/i })).toBeInTheDocument()
    expect(screen.getByText('1 trip · 3 planned activities')).toBeInTheDocument()
    expect(screen.getByText('May 10 – May 14, 2027')).toBeInTheDocument()
    expect(screen.getByText('5 days')).toBeInTheDocument()
    expect(screen.getByText('3 activities')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new trip/i })).toBeInTheDocument()
  })

  it('renders a destination image when one is saved', () => {
    useTripContext.mockReturnValue({
      ...defaultContextValue,
      trips: [
        {
          id: 1,
          destination: 'Kyoto',
          startDate: '10/01/2027',
          endDate: '10/03/2027',
          imageUrl: 'https://example.com/kyoto.jpg',
          itinerary: [],
        },
      ],
    })

    const { container } = render(<TripList />)

    expect(container.querySelector('.trip-card-media img')).toHaveAttribute(
      'src',
      'https://example.com/kyoto.jpg',
    )
  })

  it('should delete a trip when delete button is confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    useTripContext.mockReturnValue({
      ...defaultContextValue,
      trips: [{ id: 1, destination: 'Test', startDate: '01/01/2023', endDate: '01/10/2023' }],
    })

    render(<TripList />)

    fireEvent.click(screen.getByLabelText('Delete trip to Test'))

    await waitFor(() => expect(mockDeleteTrip).toHaveBeenCalledWith(1))
  })

  it('should not delete a trip when delete confirmation is canceled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    useTripContext.mockReturnValue({
      ...defaultContextValue,
      trips: [{ id: 1, destination: 'Test', startDate: '01/01/2023', endDate: '01/10/2023' }],
    })

    render(<TripList />)

    fireEvent.click(screen.getByLabelText('Delete trip to Test'))

    expect(mockDeleteTrip).not.toHaveBeenCalled()
  })
})
