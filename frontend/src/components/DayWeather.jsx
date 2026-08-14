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
const formatHour = (hour) => {
  if (!Number.isInteger(hour)) return '—';
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return `${hour % 12} ${hour < 12 ? 'AM' : 'PM'}`;
};

function WeatherMetricIcon({ type }) {
  if (type === 'rain') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 16h9a4 4 0 0 0 .6-8A6 6 0 0 0 6.2 6.5 4.8 4.8 0 0 0 8 16Z" /><path d="m9 19-1 2M14 19l-1 2M19 18l-1 2" /></svg>;
  }
  if (type === 'humidity') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3s-6 6.2-6 11a6 6 0 0 0 12 0c0-4.8-6-11-6-11Z" /><path d="M9.5 15.5c.7 1 1.5 1.5 2.5 1.5" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h11c2.7 0 2.7-4 0-4-1.2 0-2 .6-2.4 1.5M3 12h16c2.7 0 2.7 4 0 4-1.2 0-2-.6-2.4-1.5M3 16h7" /></svg>;
}

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
  const hourlyRef = useRef(null);

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

  useEffect(() => {
    if (!weather?.hourly?.length) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const track = hourlyRef.current;
      const noon = track?.querySelector('[data-hour="12"]')
        || track?.children[Math.floor(track.children.length / 2)];
      if (!track || !noon) return;
      const centeredLeft = noon.offsetLeft - ((track.clientWidth - noon.offsetWidth) / 2);
      track.scrollTo?.({ left: Math.max(0, centeredLeft), behavior: 'auto' });
      if (!track.scrollTo) track.scrollLeft = Math.max(0, centeredLeft);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [weather]);

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
            </div>
            {weather.forecast.iconUrl && <img src={weather.forecast.iconUrl} alt="" />}
          </header>

          <div className="trip-day-weather-periods" aria-label="Daytime and nighttime summary">
            {(weather.forecast.periods || []).map((period) => (
                <section
                  key={period.label}
                  className={period.label === 'Nighttime' ? 'is-nighttime' : 'is-daytime'}
                >
                  <div className="trip-day-weather-period-heading">
                    <span>{period.label}</span>
                    <strong>{temperature(period.temperature)}</strong>
                  </div>
                  <div className="trip-day-weather-period-condition">
                    {period.iconUrl && <img src={period.iconUrl} alt="" />}
                    <strong>{period.description}</strong>
                  </div>
                  <dl className="trip-day-weather-period-metrics">
                    <div><WeatherMetricIcon type="rain" /><dt>Rain</dt><dd>{percentage(period.precipitationChance)}</dd></div>
                    <div><WeatherMetricIcon type="humidity" /><dt>Humidity</dt><dd>{percentage(period.humidity)}</dd></div>
                    <div><WeatherMetricIcon type="wind" /><dt>Wind</dt><dd>{Number.isFinite(period.windSpeed) ? `${Math.round(period.windSpeed)} mph` : '—'}</dd></div>
                  </dl>
                </section>
            ))}
          </div>

          {weather.hourly?.length ? (
            <div className="trip-day-weather-hourly-wrap">
              <div className="trip-day-weather-hourly-heading">
                <strong>Hourly forecast</strong>
              </div>
              <div ref={hourlyRef} className="trip-day-weather-hourly" aria-label="Hourly forecast">
                {weather.hourly.map((hour, index) => {
                  const previousHour = weather.hourly[index - 1];
                  const transition = previousHour?.isDaytime === false && hour.isDaytime === true
                    ? ' is-sunrise'
                    : previousHour?.isDaytime === true && hour.isDaytime === false
                      ? ' is-sunset'
                      : '';
                  const timeOfDay = hour.isDaytime === false ? 'is-nighttime' : 'is-daytime';
                  return (
                  <section
                    key={hour.hour}
                    data-hour={hour.hour}
                    className={`${timeOfDay}${transition}`}
                    aria-label={`${formatHour(hour.hour)}: ${hour.description}`}
                  >
                    <time>{formatHour(hour.hour)}</time>
                    {hour.iconUrl && <img src={hour.iconUrl} alt="" />}
                    <strong>{temperature(hour.temperature)}</strong>
                    <span>{percentage(hour.precipitationChance)} rain</span>
                    <small title={`${hour.description}. Feels like ${temperature(hour.feelsLike)}. Humidity ${percentage(hour.humidity)}.`}>
                      {hour.description}
                    </small>
                  </section>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="trip-day-weather-hourly-unavailable">Hourly details are not available for this day.</p>
          )}
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
