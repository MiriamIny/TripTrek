import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { MemoryRouter } from 'react-router-dom'

import TripDetail from './TripDetail'

import { TripProvider } from '../context/TripContext'

import '@testing-library/jest-dom'

import { beforeEach, describe, expect, it, vi } from 'vitest'
 
// Mock useParams and useNavigate

const mockNavigate = vi.fn()

const mockTripId = 'trip123'

const mockUserId = 'user456'
 
vi.mock('react-router-dom', async () => {

  const actual = await vi.importActual('react-router-dom')

  return {

    ...actual,

    useNavigate: () => mockNavigate,

    useParams: () => ({ tripId: mockTripId })

  }

})
 
// Mock trip data

const mockTrip = {

  pk: mockUserId,  // User ID as primary key

  sk: mockTripId,  // Trip ID as sort key

  destination: 'Paris',

  startDate: '07/20/2025',

  endDate: '07/22/2025',

  itinerary: [

    {

      date: '07/20/2025',

      activities: [

        { time: '10:00 AM', name: 'Visit Louvre Museum' },

        { time: '2:00 PM', name: 'Walk along Seine River' }

      ]

    },

    {

      date: '07/21/2025',

      activities: [

        { time: '9:00 AM', name: 'Eiffel Tower Visit' }

      ]

    },

    {

      date: '07/22/2025',

      activities: []

    }

  ]

}
 
// Mock TripContext

const mockTripContext = {

  trips: [mockTrip],

  loading: false,

  saveTrip: vi.fn(),

  getTripById: vi.fn((id) => id === mockTripId ? mockTrip : null)

}
 
vi.mock('../context/TripContext', () => ({

  TripProvider: ({ children }) => children,

  useTripContext: () => mockTripContext

}))
 
// Mock AuthContext

vi.mock('../context/AuthContext', () => ({

  AuthProvider: ({ children }) => children,

  useAuth: () => ({

    user: { id: mockUserId },

    isAuthenticated: true,

    login: vi.fn(),

    logout: vi.fn(),

    loading: false

  })

}))
 
// Helper function to render component with all required providers

const renderWithProviders = (component) => {

  return render(
<MemoryRouter>
<TripProvider>

        {component}
</TripProvider>
</MemoryRouter>

  )

}
 
describe('TripDetail', () => {

  beforeEach(() => {

    vi.clearAllMocks()

    // Reset mock context to default values

    mockTripContext.trips = [mockTrip]

    mockTripContext.loading = false

    mockTripContext.getTripById = vi.fn((id) => id === mockTripId ? mockTrip : null)

    mockTripContext.saveTrip = vi.fn().mockResolvedValue()

  })
 
  it('shows loading spinner when loading', () => {

    mockTripContext.loading = true
 
    renderWithProviders(<TripDetail />)

    expect(screen.getByRole('status')).toBeInTheDocument()

  })
 
  it('shows trip not found when trip does not exist', async () => {

    mockTripContext.trips = []

    mockTripContext.getTripById = vi.fn(() => null)
 
    renderWithProviders(<TripDetail />)
 
    await waitFor(() => {

      expect(screen.getByText('Trip Not Found')).toBeInTheDocument()

    })

    expect(screen.getByText('The requested trip could not be found.')).toBeInTheDocument()

    expect(screen.getByText('Back to Trips')).toBeInTheDocument()

  })
 
  it('navigates back to trips when "Back to Trips" is clicked on not found page', async () => {

    mockTripContext.trips = []

    mockTripContext.getTripById = vi.fn(() => null)
 
    renderWithProviders(<TripDetail />)
 
    await waitFor(() => {

      expect(screen.getByText('Trip Not Found')).toBeInTheDocument()

    })
 
    fireEvent.click(screen.getByText('Back to Trips'))

    expect(mockNavigate).toHaveBeenCalledWith('/trips')

  })
 
  it('renders trip details with itinerary when trip exists', async () => {

    renderWithProviders(<TripDetail />)
 
    await waitFor(() => {

      expect(screen.getByText('Paris')).toBeInTheDocument()

    })
 
    // Check trip destination and dates

    expect(screen.getByText('Jul 20 – 22, 2025')).toBeInTheDocument()
 
    // Check itinerary days

    expect(screen.getByText('07/20/2025')).toBeInTheDocument()

    expect(screen.getByText('07/21/2025')).toBeInTheDocument()

    expect(screen.getByText('07/22/2025')).toBeInTheDocument()
 
    // Check activities

    expect(screen.getByText('Visit Louvre Museum')).toBeInTheDocument()

    expect(screen.getByText('Walk along Seine River')).toBeInTheDocument()

    expect(screen.getByText('Eiffel Tower Visit')).toBeInTheDocument()

    expect(screen.getByText('10:00 AM')).toBeInTheDocument()

    expect(screen.getByText('2:00 PM')).toBeInTheDocument()

    expect(screen.getByText('9:00 AM')).toBeInTheDocument()

  })
 
  it('shows "No activities planned" for days with empty activities', async () => {

    renderWithProviders(<TripDetail />)
 
    await waitFor(() => {

      expect(screen.getByText('Paris')).toBeInTheDocument()

    })
 
    expect(screen.getByText('No activities planned for this day.')).toBeInTheDocument()

  })
 
  it('shows "No itinerary available" when trip has no itinerary', async () => {

    const tripWithoutItinerary = { 

      ...mockTrip, 

      pk: mockUserId,

      sk: mockTripId,

      itinerary: [] 

    }

    mockTripContext.getTripById = vi.fn(() => tripWithoutItinerary)
 
    renderWithProviders(<TripDetail />)
 
    await waitFor(() => {

      expect(screen.getByText('No itinerary available for this trip.')).toBeInTheDocument()

    })

  })
 
  it('navigates back to trips when "Back to Trips" button is clicked', async () => {

    renderWithProviders(<TripDetail />)
 
    await waitFor(() => {

      expect(screen.getByRole('button', { name: 'Back to Trips' })).toBeInTheDocument()

    })
 
    fireEvent.click(screen.getByRole('button', { name: 'Back to Trips' }))

    expect(mockNavigate).toHaveBeenCalledWith('/trips')

  })
 
  it('enters edit mode when "Edit Trip" button is clicked', async () => {

    renderWithProviders(<TripDetail />)
 
    await waitFor(() => {

      expect(screen.getByText('Edit Trip')).toBeInTheDocument()

    })
 
    fireEvent.click(screen.getByText('Edit Trip'))
 
    // Should show the trip form

    await waitFor(() => {

      expect(screen.getByText('Add / Edit Trip')).toBeInTheDocument()

    })

    expect(screen.getByDisplayValue('Paris')).toBeInTheDocument()

  })
 
  it('exits edit mode when cancel is clicked in form', async () => {

    renderWithProviders(<TripDetail />)
 
    await waitFor(() => {

      expect(screen.getByText('Edit Trip')).toBeInTheDocument()

    })
 
    // Enter edit mode

    fireEvent.click(screen.getByText('Edit Trip'))
 
    await waitFor(() => {

      expect(screen.getByText('Add / Edit Trip')).toBeInTheDocument()

    })
 
    // Cancel editing

    fireEvent.click(screen.getByText('Cancel'))
 
    await waitFor(() => {

      expect(screen.getByText('Paris')).toBeInTheDocument()

    })

    expect(screen.queryByText('Add / Edit Trip')).not.toBeInTheDocument()

  })
 
  it('shows trip destination in header when in edit mode', async () => {

    renderWithProviders(<TripDetail />)
 
    await waitFor(() => {

      expect(screen.getByText('Edit Trip')).toBeInTheDocument()

    })
 
    fireEvent.click(screen.getByText('Edit Trip'))
 
    await waitFor(() => {

      expect(screen.getByRole('heading', { name: 'Paris', level: 1 })).toBeInTheDocument()

    })

  })
 
  it('passes correct trip data to TripForm when editing', async () => {

    renderWithProviders(<TripDetail />)
 
    await waitFor(() => {

      expect(screen.getByText('Edit Trip')).toBeInTheDocument()

    })
 
    // Enter edit mode

    fireEvent.click(screen.getByText('Edit Trip'))
 
    await waitFor(() => {

      expect(screen.getByText('Add / Edit Trip')).toBeInTheDocument()

    })
 
    // Verify the form receives the correct trip data (destination field is populated)

    expect(screen.getByDisplayValue('Paris')).toBeInTheDocument()

    // The custom date triggers show the saved dates in a friendly format.

    const travelDates = screen.getByLabelText('Travel dates')

    expect(travelDates).toHaveTextContent('Jul 20, 2025')

    expect(travelDates).toHaveTextContent('Jul 22, 2025')

  })
 
  it('calls getTripById when trips or tripId changes', async () => {

    renderWithProviders(<TripDetail />)
 
    await waitFor(() => {

      expect(mockTripContext.getTripById).toHaveBeenCalledWith(mockTripId)

    })
 
    expect(screen.getByText('Paris')).toBeInTheDocument()

  })

})
