import { useEffect, useMemo, useState } from 'react';
import { format, parse } from 'date-fns';
import { useNavigate, useParams } from 'react-router-dom';
import TripForm from '../components/TripForm';
import TripMap from '../components/TripMap';
import { useTripContext } from '../context/TripContext';
import './TripDetail.css';

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const parseTripDate = (value) => {
  if (!value) return null;
  const date = parse(value, 'MM/dd/yyyy', new Date());
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatLongDate = (value, includeYear = true) => {
  const date = parseTripDate(value);
  return date ? format(date, includeYear ? 'MMM d, yyyy' : 'EEEE, MMMM d') : value;
};

const formatTripRange = (startValue, endValue) => {
  const start = parseTripDate(startValue);
  const end = parseTripDate(endValue);
  if (!start || !end) return [startValue, endValue].filter(Boolean).join(' – ');
  if (start.getFullYear() !== end.getFullYear()) {
    return `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`;
  }
  if (start.getMonth() === end.getMonth()) {
    return `${format(start, 'MMM d')} – ${format(end, 'd, yyyy')}`;
  }
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
};

const getTripLength = (startDate, endDate) => {
  const start = parseTripDate(startDate);
  const end = parseTripDate(endDate);
  if (!start || !end || end < start) return null;
  return Math.round((end - start) / 86400000) + 1;
};

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

function HeroFallback() {
  return (
    <div className="trip-detail-hero-fallback" aria-hidden="true">
      <svg viewBox="0 0 72 72">
        <path d="M11 55c8-19 17-17 23-34 5-13 16-16 30-13" />
        <circle cx="11" cy="55" r="4" />
        <path d="M59 6c-5 0-9 4-9 9 0 7 9 15 9 15s9-8 9-15c0-5-4-9-9-9Z" />
      </svg>
    </div>
  );
}

export default function TripDetail() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const { trips, loading, saveTrip, getTripById } = useTripContext();
  const [trip, setTrip] = useState(null);
  const [editingTrip, setEditingTrip] = useState(null);
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    if (trips.length > 0) setTrip(getTripById(tripId));
  }, [trips, tripId, getTripById]);

  const activityCount = useMemo(() => (
    trip?.itinerary?.reduce((total, day) => total + (day.activities?.length || 0), 0) || 0
  ), [trip]);
  const tripLength = getTripLength(trip?.startDate, trip?.endDate);

  const handleSave = async (updatedTrip) => {
    await saveTrip(updatedTrip);
    setEditingTrip(null);
    setTrip(getTripById(tripId));
  };

  if (loading) {
    return (
      <main className="trip-detail-page trip-detail-state-page">
        <div className="trip-detail-loader" role="status" aria-label="Loading trip">
          <span />
          <p>Gathering your plans…</p>
        </div>
      </main>
    );
  }

  if (!trip) {
    return (
      <main className="trip-detail-page trip-detail-state-page">
        <section className="trip-detail-not-found">
          <div className="trip-detail-not-found-icon" aria-hidden="true">?</div>
          <p className="trip-detail-eyebrow">Lost the trail?</p>
          <h1>Trip Not Found</h1>
          <p>The requested trip could not be found.</p>
          <button type="button" onClick={() => navigate('/trips')}>
            <ArrowLeftIcon />
            Back to Trips
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="trip-detail-page">
      <div className="trip-detail-inner">
        <button type="button" className="trip-detail-back" onClick={() => navigate('/trips')}>
          <ArrowLeftIcon />
          Back to Trips
        </button>

        <section className="trip-detail-hero">
          <div className="trip-detail-hero-media">
            {trip.imageUrl ? (
              <img src={trip.imageUrl} alt={`${trip.destination} trip`} />
            ) : (
              <HeroFallback />
            )}
            <span className="trip-detail-saved-badge">Saved trip</span>
          </div>

          <div className="trip-detail-hero-content">
            <p className="trip-detail-eyebrow">Your next chapter</p>
            <h1>{trip.destination}</h1>
            <p className="trip-detail-date-range">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" />
              </svg>
              {formatTripRange(trip.startDate, trip.endDate)}
            </p>

            <dl className="trip-detail-quick-stats">
              <div>
                <dt>Length</dt>
                <dd>{tripLength ? `${tripLength} ${tripLength === 1 ? 'day' : 'days'}` : '—'}</dd>
              </div>
              <div>
                <dt>Plans</dt>
                <dd>{activityCount} {activityCount === 1 ? 'activity' : 'activities'}</dd>
              </div>
              <div>
                <dt>Days mapped</dt>
                <dd>{trip.itinerary?.length || 0}</dd>
              </div>
            </dl>

            {!editingTrip && (
              <div className="trip-detail-actions">
                <button
                  type="button"
                  className="trip-detail-primary-action"
                  onClick={() => {
                    setEditingTrip(trip);
                    setShowMap(false);
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m5 16-.8 3.8L8 19l10-10-3-3L5 16ZM13.8 7.2l3 3" />
                  </svg>
                  Edit Trip
                </button>
                {apiKey && (
                  <button type="button" className="trip-detail-secondary-action" onClick={() => setShowMap((visible) => !visible)}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m4 6 5-2 6 2 5-2v14l-5 2-6-2-5 2V6ZM9 4v14M15 6v14" />
                    </svg>
                    {showMap ? 'Hide Map' : 'Show Map'}
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {editingTrip ? (
          <section className="trip-detail-edit-section" aria-label="Edit trip">
            <TripForm trip={editingTrip} onSave={handleSave} onCancel={() => setEditingTrip(null)} />
          </section>
        ) : (
          <>
            <section className="trip-detail-itinerary" aria-labelledby="trip-detail-itinerary-heading">
              <header className="trip-detail-section-heading">
                <div>
                  <p className="trip-detail-eyebrow">Day by day</p>
                  <h2 id="trip-detail-itinerary-heading">Your itinerary</h2>
                </div>
                <p>{activityCount ? 'Everything you have planned, all in one place.' : 'A little room for possibility.'}</p>
              </header>

              {trip.itinerary?.length ? (
                <div className="trip-detail-timeline">
                  {trip.itinerary.map((dayPlan, dayIndex) => (
                    <article className="trip-detail-day" key={dayPlan.date || dayIndex}>
                      <header>
                        <span>Day {dayIndex + 1}</span>
                        <div>
                          <h3>{formatLongDate(dayPlan.date, false)}</h3>
                          <p>{dayPlan.date}</p>
                        </div>
                        <small>{dayPlan.activities?.length || 0} {dayPlan.activities?.length === 1 ? 'plan' : 'plans'}</small>
                      </header>

                      {Array.isArray(dayPlan.activities) && dayPlan.activities.length > 0 ? (
                        <ul>
                          {dayPlan.activities.map((activity, activityIndex) => (
                            <li key={`${activity.time}-${activity.name}-${activityIndex}`}>
                              <time>{activity.time || 'Flexible'}</time>
                              <span aria-hidden="true" />
                              <p>{activity.name}</p>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="trip-detail-open-day">
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 3v18M3 12h18" />
                          </svg>
                          <div>
                            <strong>No activities planned for this day.</strong>
                            <p>Leave it open, or edit the trip when inspiration strikes.</p>
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="trip-detail-empty-itinerary">
                  <HeroFallback />
                  <h3>No itinerary available for this trip.</h3>
                  <p>Add a few ideas—or keep the whole adventure spontaneous.</p>
                  <button type="button" onClick={() => setEditingTrip(trip)}>Start planning</button>
                </div>
              )}
            </section>

            {apiKey && showMap && (
              <section className="trip-detail-map-section" aria-labelledby="trip-detail-map-heading">
                <header className="trip-detail-section-heading">
                  <div>
                    <p className="trip-detail-eyebrow">Explore the area</p>
                    <h2 id="trip-detail-map-heading">Trip map</h2>
                  </div>
                </header>
                <div className="trip-detail-map-frame">
                  <TripMap
                    trip={trip}
                    onMapDataReady={(mapData) => handleSave({ ...trip, mapData })}
                  />
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
