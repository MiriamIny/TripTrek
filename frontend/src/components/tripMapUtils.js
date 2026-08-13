export const getActivityLocationQueries = (activities = [], destination = '') => {
  const seen = new Set();

  return activities.flatMap((activity, activityIndex) => {
    if (activity?.mapExcluded) return [];
    const name = typeof activity?.name === 'string' ? activity.name.trim() : '';
    if (!name) return [];
    const location = typeof activity?.location === 'string' ? activity.location.trim() : '';
    const locationText = location || name;

    const normalizedLocation = locationText.toLocaleLowerCase();
    if (seen.has(normalizedLocation)) return [];
    seen.add(normalizedLocation);

    return [{
      activityIndex,
      name,
      location,
      query: destination ? `${locationText}, ${destination}` : locationText,
    }];
  });
};

const GENERIC_ACTIVITY_WORDS = new Set([
  'activity', 'explore', 'go', 'see', 'stop', 'tour', 'visit',
]);

const QUERY_STOP_WORDS = new Set([
  'a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'near', 'of', 'on', 'the',
  'to', 'with',
]);

const normalizeWords = (value = '') => String(value)
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .match(/[\p{L}\p{N}]+/gu) || [];

export const isConfidentPlaceMatch = (activity, place, destination = '') => {
  // A location explicitly chosen or typed by the user should not be second-guessed.
  if (activity?.location?.trim()) return true;

  const destinationWords = new Set(normalizeWords(destination));
  const activityWords = normalizeWords(activity?.name).filter((word) => (
    !QUERY_STOP_WORDS.has(word)
    && !GENERIC_ACTIVITY_WORDS.has(word)
    && !destinationWords.has(word)
  ));

  // Vague activities such as "dinner" should not select an arbitrary restaurant.
  if (!activityWords.length) return false;

  const candidateWords = new Set(normalizeWords([
    place?.displayName,
    place?.formattedAddress,
    place?.primaryType,
    place?.primaryTypeDisplayName,
    ...(place?.types || []),
  ].filter(Boolean).join(' ')).filter((word) => !destinationWords.has(word)));

  return activityWords.some((word) => (
    candidateWords.has(word)
    && (word.length >= 3 || /^\d+$/.test(word))
  ));
};

const coordinate = ({ lat, lng }) => `${lat},${lng}`;

export const buildGoogleMapsUrl = (places) => {
  if (!Array.isArray(places) || places.length === 0) return '';

  if (places.length === 1) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordinate(places[0].position))}`;
  }

  const params = new URLSearchParams({
    api: '1',
    origin: coordinate(places[0].position),
    destination: coordinate(places[places.length - 1].position),
    travelmode: 'driving',
  });
  const waypoints = places.slice(1, -1).map((place) => coordinate(place.position));
  if (waypoints.length) params.set('waypoints', waypoints.join('|'));

  return `https://www.google.com/maps/dir/?${params.toString()}`;
};
