import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  APIProvider,
  InfoWindow,
  Map,
  Marker,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { buildGoogleMapsUrl, getActivityLocationQueries, isConfidentPlaceMatch } from './tripMapUtils';

const DEFAULT_CENTER = { lat: 20, lng: 0 };
const PLACE_FIELDS = [
  'id', 'displayName', 'formattedAddress', 'location', 'googleMapsURI', 'photos',
  'primaryType', 'primaryTypeDisplayName', 'types',
];

const placePhoto = (place) => {
  const photo = place?.photos?.[0];
  if (!photo) return { photoUrl: '', photoAttributions: [] };

  return {
    photoUrl: photo.getURI({ maxWidth: 240, maxHeight: 160 }),
    photoAttributions: photo.authorAttributions || [],
  };
};

function DayMapViewport({ places, fallbackPlace, selectedPlaceIndex, onSelectPlace, onViewPlace }) {
  const map = useMap();
  const mapPlaces = useMemo(
    () => (places.length ? places : fallbackPlace ? [fallbackPlace] : []),
    [fallbackPlace, places],
  );

  useEffect(() => {
    if (!map) return;

    if (mapPlaces.length === 0) {
      map.setCenter(DEFAULT_CENTER);
      map.setZoom(2);
      return;
    }

    if (mapPlaces.length === 1) {
      if (mapPlaces[0].isFallback && mapPlaces[0].viewport) {
        map.fitBounds(mapPlaces[0].viewport, 48);
        return;
      }
      map.setCenter(mapPlaces[0].position);
      map.setZoom(mapPlaces[0].isFallback ? 8 : 14);
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();
    mapPlaces.forEach((place) => bounds.extend(place.position));
    map.fitBounds(bounds, 56);
  }, [map, mapPlaces]);

  const selectedPlace = selectedPlaceIndex === null ? null : mapPlaces[selectedPlaceIndex];

  return (
    <Map
      defaultCenter={mapPlaces[0]?.position || DEFAULT_CENTER}
      defaultZoom={mapPlaces.length ? 12 : 2}
      gestureHandling="cooperative"
      mapTypeControl={false}
      streetViewControl={false}
      fullscreenControl
      className="trip-day-map-canvas"
    >
      {mapPlaces.map((place, index) => (
        <Marker
          key={`${place.name}-${place.position.lat}-${place.position.lng}`}
          position={place.position}
          title={place.isFallback ? place.name : `${index + 1}. ${place.name}`}
          label={place.isFallback ? undefined : {
            text: String(index + 1),
            color: '#ffffff',
            fontSize: '11px',
            fontWeight: '700',
          }}
          onClick={() => onSelectPlace(index)}
        />
      ))}
      {selectedPlace && (
        <InfoWindow
          position={selectedPlace.position}
          onCloseClick={() => onSelectPlace(null)}
          shouldFocus={false}
          maxWidth={280}
          headerDisabled
        >
          <div className="trip-day-map-info">
            <button
              type="button"
              className="trip-day-map-info-close"
              aria-label="Close place details"
              onClick={() => onSelectPlace(null)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m7 7 10 10M17 7 7 17" />
              </svg>
            </button>
            {selectedPlace.photoUrl && (
              <figure>
                <button
                  type="button"
                  className="trip-day-map-info-photo"
                  aria-label={`View details for ${selectedPlace.name}`}
                  onClick={() => onViewPlace(selectedPlace)}
                >
                  <img
                    src={selectedPlace.photoUrl}
                    alt={`View of ${selectedPlace.name}`}
                  />
                </button>
                {selectedPlace.photoAttributions?.length > 0 && (
                  <figcaption>
                    Photo by{' '}
                    {selectedPlace.photoAttributions.map((author, index) => (
                      <span key={`${author.displayName}-${index}`}>
                        {index > 0 && ', '}
                        {author.uri ? (
                          <a href={author.uri} target="_blank" rel="noreferrer">{author.displayName}</a>
                        ) : author.displayName}
                      </span>
                    ))}
                  </figcaption>
                )}
              </figure>
            )}
            <strong>
              {!selectedPlace.isFallback && `${selectedPlaceIndex + 1}. `}
              {selectedPlace.name}
            </strong>
            <span>{selectedPlace.formattedAddress}</span>
            {selectedPlace.googleMapsURI && (
              <a href={selectedPlace.googleMapsURI} target="_blank" rel="noreferrer">
                View on Google Maps
              </a>
            )}
          </div>
        </InfoWindow>
      )}
    </Map>
  );
}

function PlaceDetailsPanel({ state, onClose }) {
  const { place, isLoading, error } = state;
  const photos = place?.photos || [];
  const heroPhoto = photos[0];
  const heroPhotoUrl = heroPhoto?.getURI({ maxWidth: 900, maxHeight: 520 }) || place?.photoUrl;
  const photoAttributions = heroPhoto?.authorAttributions || place?.photoAttributions || [];
  const reviews = (place?.reviews || []).slice(0, 3);
  const hours = place?.regularOpeningHours?.weekdayDescriptions || [];

  return (
    <section className="trip-place-details-panel" aria-label={`Details for ${place?.displayName || place?.name || 'place'}`}>
      <button type="button" className="trip-place-details-back" onClick={onClose}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
        Back to map
      </button>

      {isLoading ? (
        <div className="trip-place-details-status" role="status">
          <span className="trip-day-map-spinner" aria-hidden="true" />
          Loading place details&hellip;
        </div>
      ) : error ? (
        <div className="trip-place-details-status trip-day-map-error" role="alert">{error}</div>
      ) : (
        <div className="trip-place-details-scroll">
          <div className="trip-place-details-hero">
            {heroPhotoUrl && <img src={heroPhotoUrl} alt={`View of ${place.displayName || place.name}`} />}
            {photoAttributions.length > 0 && (
              <small>
                Photo by{' '}
                {photoAttributions.map((author, index) => (
                  <span key={`${author.displayName}-${index}`}>
                    {index > 0 && ', '}
                    {author.uri ? (
                      <a href={author.uri} target="_blank" rel="noreferrer">{author.displayName}</a>
                    ) : author.displayName}
                  </span>
                ))}
              </small>
            )}
          </div>

          <header className="trip-place-details-heading">
            <div>
              <h3>{place.displayName || place.name}</h3>
              <p>{place.formattedAddress}</p>
            </div>
            {place.rating && (
              <div className="trip-place-details-rating" aria-label={`${place.rating} out of 5 stars`}>
                <span aria-hidden="true">★</span>
                <strong>{place.rating.toFixed(1)}</strong>
                {place.userRatingCount && <small>({place.userRatingCount.toLocaleString()})</small>}
              </div>
            )}
          </header>

          <div className="trip-place-details-links">
            {place.googleMapsURI && <a href={place.googleMapsURI} target="_blank" rel="noreferrer">Google Maps</a>}
            {place.websiteURI && <a href={place.websiteURI} target="_blank" rel="noreferrer">Website</a>}
            {place.nationalPhoneNumber && <a href={`tel:${place.nationalPhoneNumber}`}>{place.nationalPhoneNumber}</a>}
          </div>

          <div className="trip-place-details-columns">
            <section>
              <h4>Hours</h4>
              {hours.length ? (
                <ul>{hours.map((description) => <li key={description}>{description}</li>)}</ul>
              ) : <p>Hours aren’t available for this place.</p>}
            </section>
            <section>
              <h4>Reviews</h4>
              {reviews.length ? reviews.map((review, index) => (
                <article key={`${review.authorAttribution?.displayName || 'review'}-${index}`}>
                  <header>
                    {review.authorAttribution?.photoURI && (
                      <img src={review.authorAttribution.photoURI} alt="" />
                    )}
                    <div>
                      {review.authorAttribution?.uri ? (
                        <a href={review.authorAttribution.uri} target="_blank" rel="noreferrer">
                          {review.authorAttribution.displayName}
                        </a>
                      ) : <strong>{review.authorAttribution?.displayName || 'Google user'}</strong>}
                      <span>{'★'.repeat(Math.round(review.rating || 0))} {review.relativePublishTimeDescription}</span>
                    </div>
                  </header>
                  {review.text && <p>{review.text}</p>}
                </article>
              )) : <p>No reviews are available for this place.</p>}
            </section>
          </div>

          {place.attributions?.length > 0 && (
            <small className="trip-place-details-provider-attribution">
              {place.attributions.map((attribution, index) => (
                <span key={`${attribution.provider}-${index}`}>
                  {index > 0 && ' · '}
                  {attribution.providerURI ? (
                    <a href={attribution.providerURI} target="_blank" rel="noreferrer">{attribution.provider}</a>
                  ) : attribution.provider}
                </span>
              ))}
            </small>
          )}
        </div>
      )}
    </section>
  );
}

function AddressAutocomplete({ value, onChange, placesLibrary, destination }) {
  const listboxId = useId();
  const sessionToken = useRef(null);
  const requestId = useRef(0);
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const input = value.trim();
    if (!placesLibrary || input.length < 2 || !isOpen) {
      setSuggestions([]);
      setIsLoading(false);
      return undefined;
    }

    if (!sessionToken.current) {
      sessionToken.current = new placesLibrary.AutocompleteSessionToken();
    }

    const currentRequest = ++requestId.current;
    const timeout = window.setTimeout(async () => {
      try {
        setIsLoading(true);
        const response = await placesLibrary.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: destination ? `${input}, ${destination}` : input,
          sessionToken: sessionToken.current,
        });
        if (currentRequest !== requestId.current) return;
        setSuggestions((response.suggestions || []).filter((suggestion) => suggestion.placePrediction).slice(0, 5));
        setActiveIndex(-1);
      } catch (error) {
        if (currentRequest === requestId.current) {
          console.warn('Unable to load address suggestions:', error);
          setSuggestions([]);
        }
      } finally {
        if (currentRequest === requestId.current) setIsLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [destination, isOpen, placesLibrary, value]);

  const selectSuggestion = async (suggestion) => {
    const place = suggestion.placePrediction.toPlace();
    try {
      await place.fetchFields({ fields: ['displayName', 'formattedAddress'] });
      const displayName = place.displayName?.trim();
      const formattedAddress = place.formattedAddress?.trim();
      const selectedLocation = displayName && formattedAddress && !formattedAddress.toLowerCase().includes(displayName.toLowerCase())
        ? `${displayName}, ${formattedAddress}`
        : formattedAddress || displayName || suggestion.placePrediction.text.toString();
      onChange(selectedLocation);
    } catch (error) {
      console.warn('Unable to load the selected place details:', error);
      onChange(suggestion.placePrediction.text.toString());
    }
    sessionToken.current = null;
    setSuggestions([]);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  return (
    <div className="trip-day-map-autocomplete">
      <input
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen && suggestions.length > 0}
        aria-controls={listboxId}
        aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
        value={value}
        placeholder="e.g. The Louvre, Rue de Rivoli"
        onFocus={() => setIsOpen(true)}
        onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
        }}
        onKeyDown={(event) => {
          if (!suggestions.length) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((index) => (index + 1) % suggestions.length);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
          } else if (event.key === 'Enter' && activeIndex >= 0) {
            event.preventDefault();
            selectSuggestion(suggestions[activeIndex]);
          } else if (event.key === 'Escape') {
            setIsOpen(false);
          }
        }}
        autoComplete="off"
        autoFocus
      />
      {isOpen && (suggestions.length > 0 || isLoading) && (
        <div className="trip-day-map-suggestions-wrap">
          {isLoading && !suggestions.length ? (
            <span className="trip-day-map-suggestions-status" role="status">Finding places&hellip;</span>
          ) : (
            <ul id={listboxId} className="trip-day-map-suggestions" role="listbox">
              {suggestions.map((suggestion, index) => (
                <li
                  id={`${listboxId}-option-${index}`}
                  key={`${suggestion.placePrediction.placeId}-${index}`}
                  role="option"
                  aria-selected={activeIndex === index}
                >
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectSuggestion(suggestion)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 21s6-5.1 6-11a6 6 0 1 0-12 0c0 5.9 6 11 6 11Z" />
                      <circle cx="12" cy="10" r="2" />
                    </svg>
                    <span>{suggestion.placePrediction.text.toString()}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function PinEditor({ activities, initialActivityIndex, initialLocation = '', mode, placesLibrary, destination, onSave, onClose }) {
  const [activityIndex, setActivityIndex] = useState(initialActivityIndex ?? activities[0]?.activityIndex ?? 0);
  const [location, setLocation] = useState(initialLocation);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const selectedActivity = activities.find((activity) => activity.activityIndex === activityIndex);
    setLocation(activityIndex === initialActivityIndex ? initialLocation : selectedActivity?.location || '');
    setError('');
  }, [activities, activityIndex, initialActivityIndex, initialLocation]);

  return (
    <form
      className="trip-day-map-add-pin"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!location.trim() || !onSave) return;

        try {
          setError('');
          setIsSaving(true);
          await onSave(Number(activityIndex), { location: location.trim(), mapExcluded: false });
          onClose();
        } catch (saveError) {
          setError(saveError.message || 'Unable to save that map location.');
        } finally {
          setIsSaving(false);
        }
      }}
    >
      <div className="trip-day-map-add-pin-heading">
        <div>
          <strong>{mode === 'edit' ? 'Edit pin' : 'Add a pin'}</strong>
          <span>Choose an activity and give it a venue, landmark, or address.</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close add pin form">×</button>
      </div>
      <div className="trip-day-map-add-pin-fields">
        <label>
          <span>Map to activity</span>
          <select
            value={activityIndex}
            onChange={(event) => setActivityIndex(Number(event.target.value))}
            disabled={mode === 'edit'}
          >
            {activities.map((activity) => (
              <option key={activity.activityIndex} value={activity.activityIndex}>
                {activity.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Venue or address</span>
          <AddressAutocomplete
            value={location}
            onChange={setLocation}
            placesLibrary={placesLibrary}
            destination={destination}
          />
        </label>
        <button type="submit" disabled={!location.trim() || isSaving}>
          {isSaving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Save pin'}
        </button>
      </div>
      <small>This location is used for the map only and won’t change the activity description.</small>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

function DayMapContent({
  dayPlan,
  destination,
  dayNumber,
  dayIndex,
  canEdit,
  editPinRequest,
  onEditPinRequestHandled,
  placeDetailsRequest,
  onPlaceDetailsRequestHandled,
  onMappedPlacesChange,
  onUpdateActivityMap,
}) {
  const placesLibrary = useMapsLibrary('places');
  const geocodingLibrary = useMapsLibrary('geocoding');
  const geocoder = useMemo(
    () => geocodingLibrary && new geocodingLibrary.Geocoder(),
    [geocodingLibrary],
  );
  const locationQueries = useMemo(
    () => getActivityLocationQueries(dayPlan?.activities, destination),
    [dayPlan?.activities, destination],
  );
  const [places, setPlaces] = useState([]);
  const [unmatchedActivities, setUnmatchedActivities] = useState([]);
  const [fallbackPlace, setFallbackPlace] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPlaceIndex, setSelectedPlaceIndex] = useState(null);
  const [pinEditor, setPinEditor] = useState(null);
  const [placeDetails, setPlaceDetails] = useState(null);
  const activities = useMemo(
    () => (dayPlan.activities || []).map((activity, activityIndex) => ({
      ...activity,
      activityIndex,
    })),
    [dayPlan.activities],
  );

  useEffect(() => {
    if (!placesLibrary) return undefined;
    let isCurrent = true;

    const findPlaces = async () => {
      setIsLoading(true);
      setPlaces([]);
      setUnmatchedActivities([]);
      setFallbackPlace(null);
      setSelectedPlaceIndex(null);

      const matches = [];
      const unmatched = [];

      for (const activity of locationQueries) {
        try {
          const result = await placesLibrary.Place.searchByText({
            textQuery: activity.query,
            fields: PLACE_FIELDS,
            maxResultCount: 1,
          });
          const match = result.places?.[0];
          const location = match?.location;

          if (!location || !isConfidentPlaceMatch(activity, match, destination)) {
            unmatched.push(activity);
            continue;
          }

          matches.push({
            ...activity,
            id: match.id,
            name: match.displayName || activity.name,
            activityName: activity.name,
            formattedAddress: match.formattedAddress || activity.location || activity.name,
            googleMapsURI: match.googleMapsURI || '',
            primaryType: match.primaryType || '',
            primaryTypeDisplayName: match.primaryTypeDisplayName || '',
            types: match.types || [],
            position: { lat: location.lat(), lng: location.lng() },
            ...placePhoto(match),
          });
        } catch (placeError) {
          console.warn(`Unable to match activity with Places: ${activity.name}`, placeError);
          unmatched.push(activity);
        }
      }

      let destinationFallback = null;
      const tripDestination = typeof destination === 'string' ? destination.trim() : '';
      if (!matches.length && tripDestination) {
        try {
          const result = await placesLibrary.Place.searchByText({
            textQuery: tripDestination,
            fields: ['id', 'displayName', 'formattedAddress', 'location', 'googleMapsURI', 'viewport'],
            maxResultCount: 1,
          });
          const match = result.places?.[0];
          const location = match?.location;
          if (location) {
            destinationFallback = {
              id: match.id,
              name: match.displayName || tripDestination,
              formattedAddress: match.formattedAddress || tripDestination,
              googleMapsURI: match.googleMapsURI || '',
              position: { lat: location.lat(), lng: location.lng() },
              viewport: match.viewport || null,
              isFallback: true,
            };
          }
        } catch (placesDestinationError) {
          console.warn(`Unable to find trip destination with Places: ${tripDestination}`, placesDestinationError);
        }

        if (!destinationFallback && geocoder) {
          try {
            const result = await geocoder.geocode({ address: tripDestination });
            const match = result.results?.[0];
            const location = match?.geometry?.location;
            if (location) {
              destinationFallback = {
                name: tripDestination,
                formattedAddress: match.formatted_address || tripDestination,
                position: { lat: location.lat(), lng: location.lng() },
                viewport: match.geometry.viewport || null,
                isFallback: true,
              };
            }
          } catch (destinationError) {
            console.warn(`Unable to geocode trip destination: ${tripDestination}`, destinationError);
          }
        }
      }

      if (!isCurrent) return;
      setPlaces(matches);
      setUnmatchedActivities(unmatched);
      setFallbackPlace(destinationFallback);
      setIsLoading(false);
    };

    findPlaces();
    return () => {
      isCurrent = false;
    };
  }, [destination, geocoder, locationQueries, placesLibrary]);

  useEffect(() => {
    onMappedPlacesChange?.(dayIndex, places);
  }, [dayIndex, onMappedPlacesChange, places]);

  useEffect(() => {
    if (!editPinRequest) return;
    setPinEditor({
      mode: 'edit',
      activityIndex: editPinRequest.activityIndex,
      location: editPinRequest.location,
    });
    onEditPinRequestHandled?.();
  }, [editPinRequest, onEditPinRequestHandled]);

  const openPlaceDetails = useCallback(async (summary) => {
    if (!placesLibrary || !summary?.id) return;
    setSelectedPlaceIndex(null);
    setPlaceDetails({ place: summary, isLoading: true, error: '' });

    try {
      const detailedPlace = new placesLibrary.Place({ id: summary.id });
      await detailedPlace.fetchFields({
        fields: [
          'displayName',
          'formattedAddress',
          'googleMapsURI',
          'nationalPhoneNumber',
          'photos',
          'rating',
          'regularOpeningHours',
          'reviews',
          'userRatingCount',
          'websiteURI',
        ],
      });
      setPlaceDetails({
        place: {
          ...summary,
          attributions: detailedPlace.attributions || [],
          displayName: detailedPlace.displayName || summary.name,
          formattedAddress: detailedPlace.formattedAddress || summary.formattedAddress,
          googleMapsURI: detailedPlace.googleMapsURI || summary.googleMapsURI,
          nationalPhoneNumber: detailedPlace.nationalPhoneNumber || '',
          photos: detailedPlace.photos || [],
          rating: detailedPlace.rating || null,
          regularOpeningHours: detailedPlace.regularOpeningHours || null,
          reviews: detailedPlace.reviews || [],
          userRatingCount: detailedPlace.userRatingCount || null,
          websiteURI: detailedPlace.websiteURI || '',
        },
        isLoading: false,
        error: '',
      });
    } catch (error) {
      console.warn(`Unable to load details for ${summary.name}:`, error);
      setPlaceDetails({
        place: summary,
        isLoading: false,
        error: 'We could not load more details for this place. Please try again.',
      });
    }
  }, [placesLibrary]);

  useEffect(() => {
    if (!placesLibrary || !placeDetailsRequest?.place) return;
    openPlaceDetails(placeDetailsRequest.place);
    onPlaceDetailsRequestHandled?.();
  }, [onPlaceDetailsRequestHandled, openPlaceDetails, placeDetailsRequest, placesLibrary]);

  if (isLoading) {
    return (
      <div className="trip-day-map-status" role="status">
        <span className="trip-day-map-spinner" aria-hidden="true" />
        Finding places for day {dayNumber}&hellip;
      </div>
    );
  }

  const mapsUrl = buildGoogleMapsUrl(
    places.length ? places : fallbackPlace ? [fallbackPlace] : [],
  );

  return (
    <>
      <div className="trip-day-map-toolbar">
        <div className="trip-day-map-summary">
          <div className="trip-day-map-summary-line">
            <strong>
              {places.length
                ? `${places.length} ${places.length === 1 ? 'place' : 'places'} mapped`
                : fallbackPlace ? fallbackPlace.name : 'World map'}
            </strong>
            {canEdit && activities.length > 0 && (
              <button
                type="button"
                className="trip-day-map-add-pin-trigger"
                aria-label="Add pin"
                title="Add pin"
                aria-expanded={pinEditor?.mode === 'add'}
                data-tooltip="Add pin"
                onClick={() => setPinEditor((current) => (
                  current?.mode === 'add'
                    ? null
                    : {
                        mode: 'add',
                        activityIndex: unmatchedActivities[0]?.activityIndex ?? activities[0]?.activityIndex,
                        location: '',
                      }
                ))}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 21s6-5.1 6-11a6 6 0 1 0-12 0c0 5.9 6 11 6 11Z" />
                  <path d="M12 7v6M9 10h6" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <div className="trip-day-map-toolbar-actions">
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noreferrer">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h13M13 6l6 6-6 6" />
              </svg>
              {places.length === 1 ? 'Open in Google Maps' : 'Get directions'}
            </a>
          )}
        </div>
      </div>

      {pinEditor && (
        <PinEditor
          key={`${pinEditor.mode}-${pinEditor.activityIndex}`}
          activities={activities}
          initialActivityIndex={pinEditor.activityIndex}
          initialLocation={pinEditor.location}
          mode={pinEditor.mode}
          placesLibrary={placesLibrary}
          destination={destination}
          onSave={onUpdateActivityMap}
          onClose={() => setPinEditor(null)}
        />
      )}

      {placeDetails ? (
        <PlaceDetailsPanel state={placeDetails} onClose={() => setPlaceDetails(null)} />
      ) : (
        <DayMapViewport
          places={places}
          fallbackPlace={fallbackPlace}
          selectedPlaceIndex={selectedPlaceIndex}
          onSelectPlace={setSelectedPlaceIndex}
          onViewPlace={openPlaceDetails}
        />
      )}

    </>
  );
}

export default function TripMap({
  dayPlan,
  destination,
  dayNumber,
  dayIndex,
  canEdit = false,
  editPinRequest,
  onEditPinRequestHandled,
  placeDetailsRequest,
  onPlaceDetailsRequestHandled,
  onMappedPlacesChange,
  onUpdateActivityMap,
}) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const [loadError, setLoadError] = useState('');

  if (!apiKey) {
    return (
      <p className="trip-day-map-status trip-day-map-error">
        Google Maps is not configured for this environment.
      </p>
    );
  }

  return (
    <APIProvider
      apiKey={apiKey}
      version="beta"
      onError={() => setLoadError('Google Maps could not load. Check the API key, enabled APIs, billing, and website restrictions.')}
    >
      {loadError ? (
        <p className="trip-day-map-status trip-day-map-error">{loadError}</p>
      ) : (
        <DayMapContent
          dayPlan={dayPlan}
          destination={destination}
          dayNumber={dayNumber}
          dayIndex={dayIndex}
          canEdit={canEdit}
          editPinRequest={editPinRequest}
          onEditPinRequestHandled={onEditPinRequestHandled}
          placeDetailsRequest={placeDetailsRequest}
          onPlaceDetailsRequestHandled={onPlaceDetailsRequestHandled}
          onMappedPlacesChange={onMappedPlacesChange}
          onUpdateActivityMap={onUpdateActivityMap}
        />
      )}
    </APIProvider>
  );
}
