import { describe, expect, it } from 'vitest'
import {
  ensureActivityIds,
  mergeTripDraft,
  normalizeTripRecord,
} from './tripAutosave'

const baseTrip = normalizeTripRecord({
  pk: 'owner-1',
  sk: 'trip-1',
  destination: 'Paris',
  startDate: '01/01/2027',
  endDate: '01/01/2027',
  version: 1,
  itinerary: [{
    date: '01/01/2027',
    activities: [{ id: 'museum', name: 'Museum', time: '10:00 AM' }],
  }],
})

describe('trip autosave helpers', () => {
  it('gives legacy activities deterministic IDs', () => {
    const itinerary = [{ date: '01/01/2027', activities: [{ name: 'Museum' }] }]
    expect(ensureActivityIds(itinerary)[0].activities[0].id).toBe('legacy-01/01/2027-0')
    expect(ensureActivityIds(itinerary)[0].activities[0].id).toBe('legacy-01/01/2027-0')
  })

  it('keeps local edits while preserving activities another editor added', () => {
    const local = {
      ...baseTrip,
      itinerary: [{
        date: '01/01/2027',
        activities: [{ id: 'museum', name: 'Louvre Museum', time: '10:00 AM' }],
      }],
    }
    const remote = {
      ...baseTrip,
      version: 2,
      itinerary: [{
        date: '01/01/2027',
        activities: [
          { id: 'museum', name: 'Museum', time: '10:00 AM' },
          { id: 'dinner', name: 'Dinner', time: '7:00 PM' },
        ],
      }],
    }

    const merged = mergeTripDraft(baseTrip, local, remote)
    expect(merged.version).toBe(2)
    expect(merged.itinerary[0].activities).toEqual([
      expect.objectContaining({ id: 'museum', name: 'Louvre Museum' }),
      expect.objectContaining({ id: 'dinner', name: 'Dinner' }),
    ])
  })

  it('uses a remote field when it was not changed in the local draft', () => {
    const merged = mergeTripDraft(
      baseTrip,
      { ...baseTrip, destination: 'Paris and Lyon' },
      { ...baseTrip, version: 2, imageUrl: 'remote-photo.jpg' },
    )
    expect(merged.destination).toBe('Paris and Lyon')
    expect(merged.imageUrl).toBe('remote-photo.jpg')
  })
})
