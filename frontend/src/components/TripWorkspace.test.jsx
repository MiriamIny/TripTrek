import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TripWorkspace from './TripWorkspace'
import { tripApiFetch } from '../api/tripApi'

vi.mock('../api/tripApi', () => ({ tripApiFetch: vi.fn() }))

const response = (data) => ({ json: vi.fn().mockResolvedValue(data) })
const trip = { id: 'trip-1', ownerId: 'owner-1', destination: 'Paris' }

describe('TripWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tripApiFetch.mockResolvedValue(response({ notes: '', todos: [], packingItems: [] }))
  })

  it('opens the to-do tool and saves a new item', async () => {
    render(<TripWorkspace trip={trip} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: 'Open To-do' }))

    const input = await screen.findByLabelText('Add a to-do')
    fireEvent.change(input, { target: { value: 'Reserve train' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to-do' }))

    await waitFor(() => expect(tripApiFetch).toHaveBeenLastCalledWith(
      'tripWorkspace?tripId=trip-1&ownerId=owner-1',
      expect.objectContaining({ method: 'PATCH' }),
    ))
    const request = JSON.parse(tripApiFetch.mock.calls.at(-1)[1].body)
    expect(request.todos[0]).toMatchObject({ text: 'Reserve train', completed: false })
    expect(screen.getByText('Reserve train')).toBeInTheDocument()
  })

  it('autosaves notes after typing', async () => {
    render(<TripWorkspace trip={trip} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Notes' }))
    const notes = await screen.findByLabelText('Trip notes')
    vi.useFakeTimers()
    fireEvent.change(notes, { target: { value: 'Hotel code 1234' } })
    await act(() => vi.advanceTimersByTimeAsync(750))

    expect(tripApiFetch).toHaveBeenLastCalledWith(
      'tripWorkspace?tripId=trip-1&ownerId=owner-1',
      expect.objectContaining({ body: JSON.stringify({ notes: 'Hotel code 1234' }) }),
    )
    vi.useRealTimers()
  })

  it('shows workspace content without edit controls for viewers', async () => {
    tripApiFetch.mockResolvedValue(response({
      notes: '',
      todos: [{ id: 'one', text: 'Confirm hotel', completed: false }],
      packingItems: [],
    }))
    render(<TripWorkspace trip={trip} canEdit={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open To-do' }))

    expect(await screen.findByText('Confirm hotel')).toBeInTheDocument()
    expect(screen.getByText('View only')).toBeInTheDocument()
    expect(screen.queryByLabelText('Add a to-do')).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeDisabled()
  })
})
