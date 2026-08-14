import { v4 as uuidv4 } from 'uuid'

const sameValue = (first, second) => JSON.stringify(first) === JSON.stringify(second)

export const ensureActivityIds = (itinerary = []) => itinerary.map((day) => ({
  ...day,
  activities: (day.activities || []).map((activity, index) => ({
    ...activity,
    id: activity.id || `legacy-${day.date || 'day'}-${index}`,
  })),
}))

export const createActivity = (activity) => ({ ...activity, id: activity.id || uuidv4() })

export const normalizeTripRecord = (trip = {}) => ({
  ...trip,
  id: trip.id || trip.sk,
  sk: trip.sk || trip.id,
  ownerId: trip.ownerId || trip.pk,
  access: trip.access || 'owner',
  itinerary: ensureActivityIds(trip.itinerary || []),
})

export const buildTripUpdates = (baseTrip, draftTrip) => {
  const updates = {}
  if (baseTrip.destination !== draftTrip.destination) {
    updates.destination = draftTrip.destination
    updates.mapData = null
  }
  if (baseTrip.startDate !== draftTrip.startDate) updates.startDate = draftTrip.startDate
  if (baseTrip.endDate !== draftTrip.endDate) updates.endDate = draftTrip.endDate
  if (!('mapData' in updates) && !sameValue(baseTrip.mapData, draftTrip.mapData)) {
    updates.mapData = draftTrip.mapData ?? null
  }
  if (!sameValue(baseTrip.itinerary, draftTrip.itinerary)) updates.itinerary = draftTrip.itinerary
  if (baseTrip.imageUrl !== draftTrip.imageUrl) updates.imageUrl = draftTrip.imageUrl || ''
  return updates
}

const mergeActivities = (baseActivities = [], localActivities = [], remoteActivities = []) => {
  const baseById = new Map(baseActivities.map((activity) => [activity.id, activity]))
  const localById = new Map(localActivities.map((activity) => [activity.id, activity]))
  const remoteById = new Map(remoteActivities.map((activity) => [activity.id, activity]))
  const merged = []

  for (const localActivity of localActivities) {
    const baseActivity = baseById.get(localActivity.id)
    const remoteActivity = remoteById.get(localActivity.id)

    if (!baseActivity) {
      merged.push(localActivity)
    } else if (!remoteActivity) {
      if (!sameValue(localActivity, baseActivity)) merged.push(localActivity)
    } else {
      merged.push(sameValue(localActivity, baseActivity) ? remoteActivity : localActivity)
    }
  }

  for (const remoteActivity of remoteActivities) {
    if (!baseById.has(remoteActivity.id) && !localById.has(remoteActivity.id)) {
      merged.push(remoteActivity)
    }
  }

  return merged
}

export const mergeTripDraft = (baseTrip, localTrip, remoteTrip) => {
  const base = normalizeTripRecord(baseTrip)
  const local = normalizeTripRecord(localTrip)
  const remote = normalizeTripRecord(remoteTrip)
  const merged = { ...remote }

  for (const field of ['destination', 'startDate', 'endDate', 'mapData', 'imageUrl']) {
    if (!sameValue(local[field], base[field])) merged[field] = local[field]
  }

  const baseDays = new Map(base.itinerary.map((day) => [day.date, day]))
  const remoteDays = new Map(remote.itinerary.map((day) => [day.date, day]))
  const localDates = new Set(local.itinerary.map((day) => day.date))

  merged.itinerary = local.itinerary.map((localDay) => {
    const baseDay = baseDays.get(localDay.date)
    const remoteDay = remoteDays.get(localDay.date)
    if (!baseDay || !remoteDay) return localDay
    return {
      ...remoteDay,
      ...localDay,
      activities: mergeActivities(baseDay.activities, localDay.activities, remoteDay.activities),
    }
  })

  for (const remoteDay of remote.itinerary) {
    if (!localDates.has(remoteDay.date) && !baseDays.has(remoteDay.date)) {
      merged.itinerary.push(remoteDay)
    }
  }

  return merged
}

export const tripDraftSignature = (trip) => JSON.stringify({
  destination: trip.destination?.trim() || '',
  startDate: trip.startDate || '',
  endDate: trip.endDate || '',
  imageUrl: trip.imageUrl || '',
  itinerary: ensureActivityIds(trip.itinerary || []),
})
