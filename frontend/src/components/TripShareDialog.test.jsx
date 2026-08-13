import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TripShareDialog from './TripShareDialog'
import { useTripContext } from '../context/TripContext'
import { useAuth } from '../context/AuthContext'

vi.mock('../context/TripContext', () => ({ useTripContext: vi.fn() }))
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

describe('TripShareDialog', () => {
  const getTripCollaborators = vi.fn()
  const shareTrip = vi.fn()
  const removeTripCollaborator = vi.fn()
  const trip = {
    id: 'trip-1',
    destination: 'Lisbon',
    ownerName: 'Miriam Owner',
    ownerEmail: 'owner@example.com',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    getTripCollaborators.mockResolvedValue([])
    shareTrip.mockResolvedValue({})
    removeTripCollaborator.mockResolvedValue({})
    useTripContext.mockReturnValue({
      getTripCollaborators,
      shareTrip,
      removeTripCollaborator,
    })
    useAuth.mockReturnValue({
      userAttributes: {
        name: 'Miriam Profile',
        email: 'owner@example.com',
        picture: 'https://example.com/miriam.jpg',
      },
    })
  })

  it('lists the owner and invites a viewer from the custom permission menu', async () => {
    render(<TripShareDialog trip={trip} onClose={vi.fn()} />)

    await waitFor(() => expect(screen.getByText(/Miriam Profile/)).toHaveTextContent('Miriam Profile (you)'))
    expect(screen.getByText('Owner')).toBeInTheDocument()
    expect(document.querySelector('.trip-share-owner-row img')).toHaveAttribute(
      'src',
      'https://example.com/miriam.jpg',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Invitation permission: Editor' }))
    const listbox = screen.getByRole('listbox', { name: 'Invitation permission' })
    fireEvent.click(within(listbox).getByRole('option', { name: /Viewer/ }))
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'friend@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add access' }))

    await waitFor(() => expect(shareTrip).toHaveBeenCalledWith(
      'trip-1',
      'friend@example.com',
      'viewer',
    ))
  })

  it('lets the owner change an existing viewer to editor', async () => {
    getTripCollaborators.mockResolvedValue([{
      email: 'friend@example.com',
      permission: 'viewer',
    }])
    render(<TripShareDialog trip={trip} onClose={vi.fn()} />)

    const trigger = await screen.findByRole('button', {
      name: 'Permission for friend@example.com: Viewer',
    })
    fireEvent.click(trigger)
    const listbox = screen.getByRole('listbox', {
      name: 'Permission for friend@example.com',
    })
    fireEvent.click(within(listbox).getByRole('option', { name: /Editor/ }))

    await waitFor(() => expect(shareTrip).toHaveBeenCalledWith(
      'trip-1',
      'friend@example.com',
      'editor',
    ))
  })
})
