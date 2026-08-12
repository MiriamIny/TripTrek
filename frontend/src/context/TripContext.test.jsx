import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TripProvider, useTripContext } from './TripContext'
import { tripApiFetch } from '../api/tripApi'
import { useAuth } from './AuthContext'

vi.mock('../api/tripApi', () => ({ tripApiFetch: vi.fn() }))
vi.mock('./AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('uuid', () => ({ v4: () => 'new-trip-id' }))

const response = (payload = {}) => ({ json: vi.fn().mockResolvedValue(payload) })
const ownedTrip = {
  pk: 'user-123',
  sk: 'trip-1',
  ownerId: 'user-123',
  access: 'owner',
  destination: 'Paris',
  startDate: '01/01/2027',
  endDate: '01/02/2027',
  itinerary: [{
    date: '01/01/2027',
    activities: [
      { name: 'Flexible lunch', time: '' },
      { name: 'Museum', time: '10:00 AM' },
    ],
  }],
}

const renderContext = () => renderHook(() => useTripContext(), {
  wrapper: ({ children }) => <TripProvider>{children}</TripProvider>,
})

describe('TripContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuth.mockReturnValue({
      user: { userId: 'user-123' },
      isAuthenticated: true,
    })
    tripApiFetch.mockResolvedValue(response([ownedTrip]))
  })

  it('requires the provider', () => {
    expect(() => renderHook(() => useTripContext())).toThrow(
      'useTripContext must be used within a TripProvider',
    )
  })

  it('loads owned and shared trips from the authenticated endpoint', async () => {
    const sharedTrip = {
      ...ownedTrip,
      pk: 'owner-789',
      sk: 'shared-1',
      ownerId: 'owner-789',
      access: 'editor',
      sharedByName: 'Miriam',
    }
    tripApiFetch.mockResolvedValueOnce(response([ownedTrip, sharedTrip]))

    const { result } = renderContext()
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(tripApiFetch).toHaveBeenCalledWith('getTripList')
    expect(result.current.trips).toHaveLength(2)
    expect(result.current.trips[1]).toMatchObject({
      id: 'shared-1',
      ownerId: 'owner-789',
      access: 'editor',
      sharedByName: 'Miriam',
    })
    expect(result.current.trips[0].itinerary[0].activities[0].name).toBe('Flexible lunch')
  })

  it('does not call the API while signed out', async () => {
    useAuth.mockReturnValue({ user: null, isAuthenticated: false })
    const { result } = renderContext()
    await act(async () => {})
    expect(tripApiFetch).not.toHaveBeenCalled()
    expect(result.current.trips).toEqual([])
  })

  it('exposes request errors to the trips page', async () => {
    tripApiFetch.mockRejectedValueOnce(new Error('Road closed'))
    const { result } = renderContext()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Road closed')
  })

  it('creates a trip without sending a browser-supplied user ID', async () => {
    const { result } = renderContext()
    await waitFor(() => expect(result.current.trips).toHaveLength(1))
    tripApiFetch.mockClear()
    tripApiFetch
      .mockResolvedValueOnce(response({ tripId: 'new-trip-id' }))
      .mockResolvedValueOnce(response([ownedTrip]))

    await act(() => result.current.saveTrip({
      destination: 'Rome',
      startDate: '04/01/2027',
      endDate: '04/01/2027',
      itinerary: [],
    }))

    const [, options] = tripApiFetch.mock.calls[0]
    const body = JSON.parse(options.body)
    expect(tripApiFetch.mock.calls[0][0]).toBe('createTrip')
    expect(body.id).toBe('new-trip-id')
    expect(body.user).toBeUndefined()
  })

  it('sends the owner ID when a collaborator edits a shared trip', async () => {
    const sharedTrip = { ...ownedTrip, ownerId: 'owner-789', access: 'editor' }
    tripApiFetch.mockResolvedValueOnce(response([sharedTrip]))
    const { result } = renderContext()
    await waitFor(() => expect(result.current.trips).toHaveLength(1))
    tripApiFetch.mockClear()
    tripApiFetch.mockResolvedValue(response({}))

    await act(() => result.current.saveTrip({ ...result.current.trips[0], destination: 'New Paris' }))

    expect(tripApiFetch.mock.calls[0][0]).toContain(
      'updateTrip?tripId=trip-1&ownerId=owner-789',
    )
    expect(JSON.parse(tripApiFetch.mock.calls[0][1].body)).not.toHaveProperty('user')
  })

  it('leaves a shared trip instead of deleting the owner trip', async () => {
    const sharedTrip = { ...ownedTrip, ownerId: 'owner-789', access: 'editor' }
    tripApiFetch.mockResolvedValueOnce(response([sharedTrip]))
    const { result } = renderContext()
    await waitFor(() => expect(result.current.trips).toHaveLength(1))
    tripApiFetch.mockClear()
    tripApiFetch.mockResolvedValue(response([]))

    await act(() => result.current.deleteTrip('trip-1'))

    expect(tripApiFetch.mock.calls[0]).toEqual([
      'tripShares?tripId=trip-1&ownerId=owner-789',
      { method: 'DELETE' },
    ])
  })

  it('adds, lists, and removes collaborators', async () => {
    const { result } = renderContext()
    await waitFor(() => expect(result.current.loading).toBe(false))
    tripApiFetch.mockClear()
    tripApiFetch
      .mockResolvedValueOnce(response([{ email: 'friend@example.com', permission: 'editor' }]))
      .mockResolvedValueOnce(response({ email: 'friend@example.com' }))
      .mockResolvedValueOnce(response({}))

    await expect(result.current.getTripCollaborators('trip-1')).resolves.toHaveLength(1)
    await result.current.shareTrip('trip-1', 'friend@example.com')
    await result.current.removeTripCollaborator('trip-1', 'friend@example.com')

    expect(tripApiFetch.mock.calls[0][0]).toBe('tripShares?tripId=trip-1')
    expect(tripApiFetch.mock.calls[1][0]).toBe('tripShares')
    expect(JSON.parse(tripApiFetch.mock.calls[1][1].body)).toEqual({
      tripId: 'trip-1', email: 'friend@example.com',
    })
    expect(tripApiFetch.mock.calls[2]).toEqual([
      'tripShares?tripId=trip-1&email=friend%40example.com',
      { method: 'DELETE' },
    ])
  })
})
