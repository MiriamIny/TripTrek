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

    // The loading spinner has visually-hidden text "Loading..."
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('should render error state correctly', () => {
    useTripContext.mockReturnValue({
      ...defaultContextValue,
      error: 'Error message',
    })

    render(<TripList />)

    expect(screen.getByText('Error Loading Trips')).toBeInTheDocument()
    expect(screen.getByText('Error message')).toBeInTheDocument()
  })

  it('should render empty list state correctly', () => {
    render(<TripList />)

    expect(screen.getByText(/No trips planned yet/)).toBeInTheDocument()
    expect(screen.getByText('+ New Trip')).toBeInTheDocument()
  })

  it('should fetch trips on mount', () => {
    render(<TripList />)

    expect(mockFetchTrips).toHaveBeenCalled()
  })

  it('should show TripForm when + New Trip is clicked', () => {
    render(<TripList />)

    fireEvent.click(screen.getByText('+ New Trip'))

    expect(screen.getByText('Save Trip')).toBeInTheDocument()
  })

  it('should handle saving a trip', async () => {
    render(<TripList />)

    fireEvent.click(screen.getByText('+ New Trip'))
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

    fireEvent.click(screen.getByText('+ New Trip'))
    fireEvent.click(screen.getByText('Cancel'))

    expect(screen.queryByText('Save Trip')).not.toBeInTheDocument()
  })

  it('should navigate to the correct trip page on trip click', () => {
    useTripContext.mockReturnValue({
      ...defaultContextValue,
      trips: [{ id: 1, destination: 'Test', startDate: '01/01/2023', endDate: '01/10/2023' }],
    })

    render(<TripList />)

    // Click on the trip item (the destination text is within a strong tag)
    fireEvent.click(screen.getByText('Test'))

    expect(mockNavigate).toHaveBeenCalledWith('/trips/1')
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
