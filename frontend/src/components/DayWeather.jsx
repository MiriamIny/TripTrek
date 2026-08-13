import { useEffect, useMemo, useState } from 'react';
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';
import { tripApiFetch } from '../api/tripApi';

const getForecastLocation = (dayPlan, destination) => {
  const withLocation = dayPlan?.activities?.find((activity) => activity.location?.trim());
  return withLocation?.location?.trim() || destination;
};

const temperature = (value) => (Number.isFinite(value) ? `${Math.round(value)}°` : '—');

function WeatherContent({ dayPlan, destination, onClose }) {
  const geocodingLibrary = useMapsLibrary('geocoding');
  const geocoder = useMemo(
    () => geocodingLibrary && new geocodingLibrary.Geocoder(),
    [geocodingLibrary],
  );
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!geocoder) return undefined;
    let isCurrent = true;

    const loadWeather = async () => {
      try {
        setLoading(true);
        setError('');
        const locationText = getForecastLocation(dayPlan, destination);
        const geocode = await geocoder.geocode({ address: locationText });
        const match = geocode.results?.[0];
        const location = match?.geometry?.location;
        if (!location) throw new Error('We could not locate this day’s destination.');

        const query = new URLSearchParams({
          date: dayPlan.date,
          latitude: String(location.lat()),
          longitude: String(location.lng()),
        });
        const response = await tripApiFetch(`weather?${query}`);
        const result = await response.json();
        if (!isCurrent) return;
        setWeather({ ...result, location: match.formatted_address || locationText });
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
  }, [dayPlan, destination, geocoder]);

  return (
    <section className="trip-day-weather-card" aria-label={`Weather for ${dayPlan.date}`}>
      <button type="button" className="trip-day-weather-close" onClick={onClose} aria-label="Hide weather">×</button>
      {loading && <p role="status">Checking the forecast…</p>}
      {!loading && error && <p role="alert">{error}</p>}
      {!loading && !error && weather && !weather.available && (
        <div className="trip-day-weather-unavailable">
          <strong>Forecast not available yet</strong>
          <span>{weather.message}</span>
        </div>
      )}
      {!loading && !error && weather?.available && (
        <div className="trip-day-weather-content">
          {weather.forecast.iconUrl && (
            <img src={weather.forecast.iconUrl} alt="" />
          )}
          <div className="trip-day-weather-summary">
            <span>{weather.location}</span>
            <strong>{weather.forecast.description}</strong>
            <small>High {temperature(weather.forecast.high)} · Low {temperature(weather.forecast.low)}</small>
          </div>
          <dl>
            <div><dt>Rain</dt><dd>{weather.forecast.precipitationChance ?? 0}%</dd></div>
            <div><dt>Humidity</dt><dd>{weather.forecast.humidity ?? '—'}{weather.forecast.humidity !== null ? '%' : ''}</dd></div>
            <div><dt>Wind</dt><dd>{weather.forecast.windSpeed ?? '—'} mph</dd></div>
          </dl>
        </div>
      )}
    </section>
  );
}

export default function DayWeather({ dayPlan, destination, onClose }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  return (
    <APIProvider apiKey={apiKey} version="beta">
      <WeatherContent dayPlan={dayPlan} destination={destination} onClose={onClose} />
    </APIProvider>
  );
}
