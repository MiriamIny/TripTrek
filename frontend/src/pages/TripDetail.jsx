import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, parse } from 'date-fns';
import { useNavigate, useParams } from 'react-router-dom';
import TripForm from '../components/TripForm';
import TripMap from '../components/TripMap';
import DayWeather from '../components/DayWeather';
import TripShareDialog from '../components/TripShareDialog';
import TripWorkspace from '../components/TripWorkspace';
import { useTripContext } from '../context/TripContext';
import { useAuth } from '../context/AuthContext';
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

function ShareIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3.5 18c.5-3.2 2.4-5 5.5-5s5 1.8 5.5 5M16 8h5M18.5 5.5v5" /></svg>;
}

function LeaveIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" /></svg>;
}

function TripBuddyAvatars({ buddies }) {
  if (!buddies.length) return <span className="trip-detail-buddies-empty">Just you</span>;
  return (
    <span className="trip-detail-buddy-list" aria-label={`${buddies.length} trip buddies`}>
      {buddies.slice(0, 5).map((buddy, index) => {
        const label = buddy.name || buddy.email || 'Trip buddy';
        const tooltip = `${label}${buddy.email && buddy.email !== label ? ` · ${buddy.email}` : ''}`;
        return (
          <span
            className="trip-detail-buddy"
            key={`${buddy.permission}-${buddy.email || index}`}
            data-tooltip={tooltip}
            aria-label={`${label}${buddy.email && buddy.email !== label ? `, ${buddy.email}` : ''}`}
            tabIndex="0"
          >
            {buddy.picture ? (
              <img src={buddy.picture} alt="" referrerPolicy="no-referrer" />
            ) : label.charAt(0).toUpperCase()}
          </span>
        );
      })}
      {buddies.length > 5 && <span className="trip-detail-buddy is-overflow">+{buddies.length - 5}</span>}
    </span>
  );
}

export default function TripDetail() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const { userAttributes = {}, user } = useAuth();
  const {
    trips,
    loading,
    saveTrip,
    getTripById,
    fetchTrips,
    getTripBuddies,
    deleteTrip,
  } = useTripContext();
  const [trip, setTrip] = useState(null);
  const [editingTrip, setEditingTrip] = useState(null);
  const [openMapDay, setOpenMapDay] = useState(null);
  const [openWeatherDay, setOpenWeatherDay] = useState(null);
  const [mappedPlacesByDay, setMappedPlacesByDay] = useState({});
  const [editPinRequest, setEditPinRequest] = useState(null);
  const [placeDetailsRequest, setPlaceDetailsRequest] = useState(null);
  const [showShare, setShowShare] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [buddies, setBuddies] = useState([]);
  const [isHeroCompact, setIsHeroCompact] = useState(false);
  const saveErrorRef = useRef(null);
  const contentStartRef = useRef(null);

  useEffect(() => {
    if (!saveError) return;
    const frame = window.requestAnimationFrame(() => {
      saveErrorRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      saveErrorRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [saveError]);

  useEffect(() => {
    if (trips.length > 0) setTrip(getTripById(tripId));
  }, [trips, tripId, getTripById]);

  useEffect(() => {
    if (editingTrip) return undefined;
    const refreshInBackground = () => {
      if (document.visibilityState === 'visible') fetchTrips({ background: true });
    };
    const interval = window.setInterval(refreshInBackground, 10000);
    window.addEventListener('focus', refreshInBackground);
    document.addEventListener('visibilitychange', refreshInBackground);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshInBackground);
      document.removeEventListener('visibilitychange', refreshInBackground);
    };
  }, [editingTrip, fetchTrips]);

  useEffect(() => {
    if (!trip || typeof getTripBuddies !== 'function') return undefined;
    let isCurrent = true;
    getTripBuddies(trip.id, trip.ownerId)
      .then((data) => {
        if (!isCurrent) return;
        const currentEmail = String(
          userAttributes.email || user?.attributes?.email || user?.signInDetails?.loginId || '',
        ).trim().toLowerCase();
        setBuddies(
          [data.owner, ...(data.collaborators || [])]
            .filter(Boolean)
            .filter((buddy) => String(buddy.email || '').trim().toLowerCase() !== currentEmail),
        );
      })
      .catch((loadError) => console.warn('Unable to load trip buddies:', loadError));
    return () => { isCurrent = false; };
  }, [getTripBuddies, trip, user, userAttributes.email]);

  useEffect(() => {
    const updateCompactHeader = () => {
      const contentTop = contentStartRef.current?.getBoundingClientRect().top;
      const compactAt = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--site-header-height'),
      ) + 42;
      setIsHeroCompact(Number.isFinite(contentTop) && contentTop <= compactAt);
    };
    updateCompactHeader();
    window.addEventListener('scroll', updateCompactHeader, { passive: true });
    window.addEventListener('resize', updateCompactHeader);
    return () => {
      window.removeEventListener('scroll', updateCompactHeader);
      window.removeEventListener('resize', updateCompactHeader);
    };
  }, [editingTrip, trip]);

  const activityCount = useMemo(() => (
    trip?.itinerary?.reduce((total, day) => total + (day.activities?.length || 0), 0) || 0
  ), [trip]);
  const tripLength = getTripLength(trip?.startDate, trip?.endDate);
  const isOwner = !trip?.access || trip.access === 'owner';
  const canEdit = isOwner || trip?.access === 'editor';

  const handleLeaveTrip = async () => {
    if (!window.confirm(`Leave the shared trip to ${trip.destination}?`)) return;
    try {
      setSaveError('');
      await deleteTrip(trip.id);
      navigate('/trips');
    } catch (leaveError) {
      setSaveError(leaveError.message || 'Unable to leave this trip.');
    }
  };

  const handleAutoSave = useCallback(async (updatedTrip) => {
    try {
      setSaveError('');
      return await saveTrip(updatedTrip);
    } catch (error) {
      setSaveError(error.message || 'Unable to save this trip.');
      throw error;
    }
  }, [saveTrip]);

  const handleActivityMapUpdate = async (dayIndex, activityIndex, mapUpdates) => {
    const itinerary = trip.itinerary.map((day, currentDayIndex) => (
      currentDayIndex === dayIndex
        ? {
            ...day,
            activities: day.activities.map((activity, currentActivityIndex) => (
              currentActivityIndex === activityIndex
                ? { ...activity, ...mapUpdates }
                : activity
            )),
          }
        : day
    ));

    await saveTrip({ ...trip, itinerary });
  };

  const handleMappedPlacesChange = useCallback((dayIndex, places) => {
    setMappedPlacesByDay((current) => ({ ...current, [dayIndex]: places }));
  }, []);

  const handleEditPinRequestHandled = useCallback(() => {
    setEditPinRequest(null);
  }, []);

  const handlePlaceDetailsRequestHandled = useCallback(() => {
    setPlaceDetailsRequest(null);
  }, []);

  const handleViewPlace = (dayIndex, place) => {
    setOpenWeatherDay(null);
    setOpenMapDay(dayIndex);
    setPlaceDetailsRequest({
      dayIndex,
      place,
      requestId: Date.now(),
    });
  };

  const handleEditPin = (dayIndex, place) => {
    setOpenWeatherDay(null);
    setOpenMapDay(dayIndex);
    setEditPinRequest({
      dayIndex,
      activityIndex: place.activityIndex,
      location: place.location || place.formattedAddress,
      requestId: Date.now(),
    });
  };

  const handleRemovePin = async (dayIndex, place) => {
    try {
      setSaveError('');
      await handleActivityMapUpdate(dayIndex, place.activityIndex, {
        location: '',
        mapExcluded: true,
      });
      setMappedPlacesByDay((current) => ({
        ...current,
        [dayIndex]: (current[dayIndex] || []).filter(
          (mappedPlace) => mappedPlace.activityIndex !== place.activityIndex,
        ),
      }));
    } catch (error) {
      setSaveError(error.message || 'Unable to remove that pin.');
    }
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
        <button
          type="button"
          className="trips-context-backbar"
          onClick={() => navigate('/trips')}
        >
          <ArrowLeftIcon />
          <span>Back to Trips</span>
        </button>

        <section className={`trip-detail-hero${isHeroCompact ? ' is-compact' : ''}`}>
          <div className="trip-detail-hero-media">
            {trip.imageUrl ? (
              <img src={trip.imageUrl} alt={`${trip.destination} trip`} />
            ) : (
              <HeroFallback />
            )}
            <span
              className={`trip-detail-saved-badge${isOwner ? '' : ' is-shared'}`}
              data-access={isOwner ? undefined : canEdit ? 'Editor' : 'Viewer'}
              aria-label={isOwner ? 'Owner' : `Shared with you as ${canEdit ? 'Editor' : 'Viewer'}`}
              tabIndex={isOwner ? undefined : 0}
            >
              {isOwner ? 'Owner' : 'Shared with you'}
            </span>
          </div>

          <div className="trip-detail-hero-content">
            <p className="trip-detail-eyebrow">
              {isOwner
                ? 'Your next chapter'
                : `Shared by ${trip.sharedByName || trip.sharedByEmail || 'a travel companion'}`}
            </p>
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
              <div className="trip-detail-buddies-stat">
                <dt>Trip buddies</dt>
                <dd>
                  <TripBuddyAvatars buddies={buddies} />
                  {isOwner ? (
                    <button
                      type="button"
                      className="trip-detail-buddy-action"
                      title="Share trip"
                      aria-label="Share Trip"
                      onClick={() => setShowShare(true)}
                    ><ShareIcon /></button>
                  ) : (
                    <button
                      type="button"
                      className="trip-detail-buddy-action is-leave"
                      title="Leave trip"
                      aria-label="Leave Trip"
                      onClick={handleLeaveTrip}
                    ><LeaveIcon /></button>
                  )}
                </dd>
              </div>
            </dl>

            {!editingTrip && (
              <div className="trip-detail-actions">
                {canEdit && (
                  <button
                    type="button"
                    className="trip-detail-primary-action"
                    onClick={() => {
                      setSaveError('');
                      setEditingTrip(trip);
                      setOpenMapDay(null);
                      setOpenWeatherDay(null);
                    }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m5 16-.8 3.8L8 19l10-10-3-3L5 16ZM13.8 7.2l3 3" />
                    </svg>
                    <span>Edit Trip</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {saveError && (
          <div
            ref={saveErrorRef}
            className="trip-detail-save-error"
            role="alert"
            tabIndex="-1"
          >
            <span>{saveError}</span>
          </div>
        )}

        {editingTrip ? (
          <section ref={contentStartRef} className="trip-detail-edit-section" aria-label="Edit trip">
            <TripForm
              trip={editingTrip}
              onAutoSave={handleAutoSave}
              onAutoSaveError={(error) => setSaveError(
                error.message || 'Unable to sync this trip. Your changes are safe on this device.',
              )}
              onDone={() => {
                setEditingTrip(null);
                setSaveError('');
              }}
            />
          </section>
        ) : (
          <>
            <section ref={contentStartRef} className="trip-detail-itinerary" aria-labelledby="trip-detail-itinerary-heading">
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
                        <div className="trip-detail-day-heading-actions">
                          <small>{dayPlan.activities?.length || 0} {dayPlan.activities?.length === 1 ? 'plan' : 'plans'}</small>
                           {apiKey && dayPlan.activities?.length > 0 && (
                             <button
                               type="button"
                               className="trip-detail-day-map-toggle"
                               data-tooltip="Map"
                               title="Map"
                               aria-label={openMapDay === dayIndex ? 'Close map' : 'Open map'}
                               aria-expanded={openMapDay === dayIndex}
                               aria-controls={`trip-day-map-${dayIndex}`}
                               onClick={() => {
                                 setOpenWeatherDay(null);
                                 setOpenMapDay((currentDay) => (currentDay === dayIndex ? null : dayIndex));
                               }}
                             >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="m4 6 5-2 6 2 5-2v14l-5 2-6-2-5 2V6ZM9 4v14M15 6v14" />
                              </svg>
                             </button>
                           )}
                           {apiKey && (
                             <button
                               type="button"
                               className="trip-detail-day-map-toggle"
                               data-tooltip="Weather"
                               title="Weather"
                               aria-label={openWeatherDay === dayIndex ? 'Close weather' : 'Open weather'}
                               aria-expanded={openWeatherDay === dayIndex}
                               aria-controls={`trip-day-weather-${dayIndex}`}
                               onClick={() => {
                                 setOpenMapDay(null);
                                 setOpenWeatherDay((currentDay) => (currentDay === dayIndex ? null : dayIndex));
                               }}
                             >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M8 17h9a4 4 0 0 0 .6-8A6 6 0 0 0 6.2 7.5 4.8 4.8 0 0 0 8 17Z" />
                              </svg>
                             </button>
                           )}
                        </div>
                      </header>

                      <div className={`trip-detail-day-body${openMapDay === dayIndex || openWeatherDay === dayIndex ? ' has-viewer' : ''}`}>
                        <div className="trip-detail-day-plans">
                          {Array.isArray(dayPlan.activities) && dayPlan.activities.length > 0 ? (
                            <ul>
                              {dayPlan.activities.map((activity, activityIndex) => {
                                const mappedPlaces = mappedPlacesByDay[dayIndex] || [];
                                const placeIndex = mappedPlaces.findIndex((place) => place.activityIndex === activityIndex);
                                const place = placeIndex >= 0 ? mappedPlaces[placeIndex] : null;
                                const placeNameDuplicatesActivity = place?.name?.trim().toLowerCase()
                                  === activity.name?.trim().toLowerCase();

                                return (
                                  <li key={`${activity.time}-${activity.name}-${activityIndex}`}>
                                    <time>{activity.time || 'Flexible'}</time>
                                    <span aria-hidden="true" />
                                    <div className="trip-detail-activity-content">
                                      <p>{activity.name}</p>
                                      {place && (
                                        <div className={`trip-detail-activity-place${openMapDay === dayIndex ? ' has-map-pin' : ''}`}>
                                          {place.photoUrl && (
                                            <button
                                              type="button"
                                              className="trip-detail-activity-place-photo"
                                              aria-label={`View details for ${place.name}`}
                                              onClick={() => handleViewPlace(dayIndex, place)}
                                            >
                                              <img src={place.photoUrl} alt="" loading="lazy" />
                                            </button>
                                          )}
                                          {openMapDay === dayIndex && (
                                            <span className="trip-detail-activity-map-pin" aria-hidden="true">
                                              <svg viewBox="0 0 24 28">
                                                <path d="M12 27S2 18.4 2 10.7A10 10 0 0 1 22 10.7C22 18.4 12 27 12 27Z" />
                                              </svg>
                                              <b>{placeIndex + 1}</b>
                                            </span>
                                          )}
                                          <div>
                                            {!placeNameDuplicatesActivity && <strong>{place.name}</strong>}
                                            <small>{place.formattedAddress}</small>
                                          </div>
                                          {canEdit && (
                                            <div className="trip-day-map-place-actions" aria-label={`Pin actions for ${activity.name}`}>
                                              <button
                                                type="button"
                                                aria-label={`Edit pin for ${activity.name}`}
                                                title="Edit pin"
                                                data-tooltip="Edit pin"
                                                onClick={() => handleEditPin(dayIndex, place)}
                                              >
                                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                                  <path d="m4 16-.7 4.7L8 20l10.6-10.6a2.1 2.1 0 0 0-3-3L5 17Z" />
                                                  <path d="m14.5 7.5 3 3" />
                                                </svg>
                                              </button>
                                              <button
                                                type="button"
                                                className="is-delete"
                                                aria-label={`Remove pin for ${activity.name}`}
                                                title="Remove pin"
                                                data-tooltip="Remove pin"
                                                onClick={() => handleRemovePin(dayIndex, place)}
                                              >
                                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                                  <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
                                                </svg>
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </li>
                                );
                              })}
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
                        </div>

                         {apiKey && openMapDay === dayIndex && (
                          <section
                            id={`trip-day-map-${dayIndex}`}
                            className="trip-day-map-panel"
                           aria-label={`Map for day ${dayIndex + 1}`}
                          >
                            <button type="button" className="trip-day-viewer-close trip-day-map-close" onClick={() => setOpenMapDay(null)} aria-label="Close map">×</button>
                            <TripMap
                              dayPlan={dayPlan}
                              destination={trip.destination}
                              dayNumber={dayIndex + 1}
                              dayIndex={dayIndex}
                              canEdit={canEdit}
                              editPinRequest={editPinRequest?.dayIndex === dayIndex ? editPinRequest : null}
                              onEditPinRequestHandled={handleEditPinRequestHandled}
                              placeDetailsRequest={placeDetailsRequest?.dayIndex === dayIndex ? placeDetailsRequest : null}
                              onPlaceDetailsRequestHandled={handlePlaceDetailsRequestHandled}
                              onMappedPlacesChange={handleMappedPlacesChange}
                              onUpdateActivityMap={(activityIndex, mapUpdates) => (
                                handleActivityMapUpdate(dayIndex, activityIndex, mapUpdates)
                              )}
                            />
                          </section>
                        )}
                        {apiKey && openWeatherDay === dayIndex && (
                          <section id={`trip-day-weather-${dayIndex}`} className="trip-day-weather-panel" aria-label={`Weather for day ${dayIndex + 1}`}>
                            <DayWeather
                              dayPlan={dayPlan}
                              destination={trip.destination}
                              mappedPlaces={mappedPlacesByDay[dayIndex] || []}
                              onClose={() => setOpenWeatherDay(null)}
                            />
                          </section>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="trip-detail-empty-itinerary">
                  <HeroFallback />
                  <h3>No itinerary available for this trip.</h3>
                  <p>Add a few ideas—or keep the whole adventure spontaneous.</p>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setSaveError('');
                        setEditingTrip(trip);
                      }}
                    >
                      Start planning
                    </button>
                  )}
                </div>
              )}
            </section>

          </>
        )}
      </div>
      {showShare && (
        <TripShareDialog trip={trip} onClose={() => setShowShare(false)} />
      )}
      <TripWorkspace trip={trip} canEdit={canEdit} />
    </main>
  );
}
