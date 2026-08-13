import { useEffect, useMemo, useRef, useState } from 'react';
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';
import { tripApiFetch } from '../api/tripApi';

const uniqueLocationQueries = (dayPlan, destination, mappedPlaces = []) => {
  const seen = new Set();
  const activityLocations = (dayPlan?.activities || []).flatMap((activity) => {
    const location = activity?.location?.trim();
    if (!location || activity.mapExcluded) return [];
    const normalized = location.toLocaleLowerCase();
    if (seen.has(normalized)) return [];
    seen.add(normalized);
    return [{ name: location }];
  });

  const mappedLocations = mappedPlaces.flatMap((place) => {
    if (dayPlan?.activities?.[place.activityIndex]?.location?.trim()) return [];
    const name = (place.formattedAddress || place.name || '').trim();
    if (!name) return [];
    const normalized = name.toLocaleLowerCase();
    if (seen.has(normalized)) return [];
    seen.add(normalized);
    return [{ name }];
  });

  if (activityLocations.length || mappedLocations.length) return [...activityLocations, ...mappedLocations];
  return destination?.trim() ? [{ name: destination.trim() }] : [];
};

const temperature = (value) => (Number.isFinite(value) ? `${Math.round(value)}°` : '—');
const percentage = (value) => (Number.isFinite(value) ? `${value}%` : '—');

const addressComponent = (components, types) => (
  components?.find((component) => types.some((type) => component.types.includes(type)))
);

const weatherArea = (match, fallback) => {
  const components = match?.address_components || [];
  const city = addressComponent(components, ['locality', 'postal_town', 'administrative_area_level_3']);
  const county = addressComponent(components, ['administrative_area_level_2']);
  const state = addressComponent(components, ['administrative_area_level_1']);
  const country = addressComponent(components, ['country']);
  const primary = city || county || state || country;

  return {
    key: [primary?.long_name, state?.short_name, country?.short_name]
      .filter(Boolean)
      .join('|')
      .toLocaleLowerCase() || fallback.toLocaleLowerCase(),
    name: [primary?.long_name || fallback, primary !== state ? state?.short_name : null]
      .filter(Boolean)
      .join(', '),
  };
};

function WeatherLocationCard({ location, dayPlan }) {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isCurrent = true;

    const loadWeather = async () => {
      try {
        setLoading(true);
        setError('');
        const query = new URLSearchParams({
          date: dayPlan.date,
          latitude: String(location.latitude),
          longitude: String(location.longitude),
        });
        const response = await tripApiFetch(`weather?${query}`);
        const result = await response.json();
        if (isCurrent) setWeather({ ...result, location: location.name });
      } catch (loadError) {
        if (isCurrent) setError(loadError.message || 'Weather is temporarily unavailable.');
      } finally {
        if (isCurrent) setLoading(false);
      }
    };

    loadWeather();
    return () => {
      isCurrent = false;
    };
  }, [dayPlan.date, location.latitude, location.longitude, location.name]);

  return (
    <article className="trip-day-weather-slide" aria-label={`Weather for ${location.name}`}>
      {loading && <p className="trip-day-weather-status" role="status">Checking {location.name}…</p>}
      {!loading && error && <p className="trip-day-weather-status" role="alert">{error}</p>}
      {!loading && !error && weather && !weather.available && (
        <div className="trip-day-weather-unavailable">
          <span>{weather.location}</span>
          <strong>Forecast not available yet</strong>
          <p>{weather.message}</p>
        </div>
      )}
      {!loading && !error && weather?.available && (
        <div className="trip-day-weather-content">
          <header>
            <div>
              <span className="trip-day-weather-location">{weather.location}</span>
              <strong>{weather.forecast.description}</strong>
              <small>High {temperature(weather.forecast.high)} · Low {temperature(weather.forecast.low)}</small>
            </div>
            {weather.forecast.iconUrl && <img src={weather.forecast.iconUrl} alt="" />}
          </header>

          <dl className="trip-day-weather-metrics">
            <div><dt>Rain</dt><dd>{percentage(weather.forecast.precipitationChance)}</dd></div>
            <div><dt>Humidity</dt><dd>{percentage(weather.forecast.humidity)}</dd></div>
            <div><dt>Wind</dt><dd>{Number.isFinite(weather.forecast.windSpeed) ? `${Math.round(weather.forecast.windSpeed)} mph` : '—'}</dd></div>
          </dl>

          <div className="trip-day-weather-periods" aria-label="Time of day forecast">
            {(weather.forecast.periods || []).map((period) => (
              <section key={period.label}>
                <span>{period.label}</span>
                {period.iconUrl && <img src={period.iconUrl} alt="" />}
                <strong>{period.description}</strong>
                <small>{percentage(period.precipitationChance)} rain · {percentage(period.humidity)} humidity</small>
              </section>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function WeatherContent({ dayPlan, destination, mappedPlaces, onClose }) {
  const geocodingLibrary = useMapsLibrary('geocoding');
  const geocoder = useMemo(
    () => geocodingLibrary && new geocodingLibrary.Geocoder(),
    [geocodingLibrary],
  );
  const locationQueries = useMemo(
    () => uniqueLocationQueries(dayPlan, destination, mappedPlaces),
    [dayPlan, destination, mappedPlaces],
  );
  const [locations, setLocations] = useState([]);
  const [isLocating, setIsLocating] = useState(true);
  const [locationError, setLocationError] = useState('');
  const trackRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!geocoder) return undefined;
    let isCurrent = true;

    const groupLocationsByArea = async () => {
      setIsLocating(true);
      setLocationError('');
      const results = await Promise.allSettled(locationQueries.map(async (location) => {
        const geocode = await geocoder.geocode({ address: location.name });
        const match = geocode.results?.[0];
        const point = match?.geometry?.location;
        if (!point) throw new Error(`Unable to locate ${location.name}`);
        return {
          ...weatherArea(match, location.name),
          latitude: point.lat(),
          longitude: point.lng(),
        };
      }));

      if (!isCurrent) return;
      const grouped = [];
      const seenAreas = new Set();
      results.forEach((result) => {
        if (result.status !== 'fulfilled' || seenAreas.has(result.value.key)) return;
        seenAreas.add(result.value.key);
        grouped.push(result.value);
      });
      setLocations(grouped);
      setActiveIndex(0);
      if (!grouped.length) setLocationError('We could not locate this day’s destinations.');
      setIsLocating(false);
    };

    groupLocationsByArea();
    return () => {
      isCurrent = false;
    };
  }, [geocoder, locationQueries]);

  const goTo = (index) => {
    const safeIndex = Math.max(0, Math.min(index, locations.length - 1));
    const slide = trackRef.current?.children[safeIndex];
    slide?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
    setActiveIndex(safeIndex);
  };

  const handleScroll = () => {
    const track = trackRef.current;
    if (!track?.clientWidth) return;
    setActiveIndex(Math.min(locations.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
  };

  return (
    <section className="trip-day-weather-card" aria-label={`Weather for ${dayPlan.date}`}>
      <div className="trip-day-viewer-heading">
        <div>
          <span>Weather</span>
          <strong>{locations.length > 1 ? `${locations.length} areas` : locations[0]?.name || 'Trip area'}</strong>
        </div>
        <button type="button" className="trip-day-viewer-close" onClick={onClose} aria-label="Close weather">×</button>
      </div>

      <div className="trip-day-weather-carousel">
        {isLocating && <p className="trip-day-weather-status" role="status">Finding weather areas…</p>}
        {!isLocating && locationError && <p className="trip-day-weather-status" role="alert">{locationError}</p>}
        {locations.length > 1 && (
          <button type="button" className="trip-day-weather-arrow is-previous" onClick={() => goTo(activeIndex - 1)} disabled={activeIndex === 0} aria-label="Previous area">‹</button>
        )}
        <div className="trip-day-weather-track" ref={trackRef} onScroll={handleScroll}>
          {locations.map((location) => (
            <WeatherLocationCard key={location.key} location={location} dayPlan={dayPlan} />
          ))}
        </div>
        {locations.length > 1 && (
          <button type="button" className="trip-day-weather-arrow is-next" onClick={() => goTo(activeIndex + 1)} disabled={activeIndex === locations.length - 1} aria-label="Next area">›</button>
        )}
      </div>

      {locations.length > 1 && (
        <div className="trip-day-weather-dots" aria-label={`Area ${activeIndex + 1} of ${locations.length}`}>
          {locations.map((location, index) => (
            <button key={location.key} type="button" className={index === activeIndex ? 'is-active' : ''} onClick={() => goTo(index)} aria-label={`View weather for ${location.name}`} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function DayWeather({ dayPlan, destination, mappedPlaces = [], onClose }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  return (
    <APIProvider apiKey={apiKey} version="beta">
      <WeatherContent dayPlan={dayPlan} destination={destination} mappedPlaces={mappedPlaces} onClose={onClose} />
    </APIProvider>
  );
}
