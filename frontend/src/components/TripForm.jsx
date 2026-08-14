import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { eachDayOfInterval, format, parse } from 'date-fns';
import imageCompression from 'browser-image-compression';
import { APIProvider } from '@vis.gl/react-google-maps';
import { useTripContext } from '../context/TripContext';
import { useAuth } from '../context/AuthContext';
import ActivityTimeSelect from './ActivityTimeSelect';
import PlaceAddressAutocomplete from './PlaceAddressAutocomplete';
import TripDatePicker from './TripDatePicker';
import {
  createActivity,
  ensureActivityIds,
  mergeTripDraft,
  tripDraftSignature,
} from '../utils/tripAutosave';
import './TripForm.css';

const parseMDY = (value) => parse(value, 'MM/dd/yyyy', new Date());

const formatTime12Hour = (timeValue) => {
  const [hour, minute] = timeValue.split(':');
  const numericHour = parseInt(hour, 10);
  const suffix = numericHour >= 12 ? 'PM' : 'AM';
  const displayHour = numericHour % 12 || 12;
  return `${displayHour}:${minute} ${suffix}`;
};

const toSortableTime = (value) => {
  if (!value) return '';
  const [time, modifier] = value.split(' ');
  let [hour, minute] = time.split(':');
  if (modifier === 'PM' && hour !== '12') hour = String(Number(hour) + 12);
  if (modifier === 'AM' && hour === '12') hour = '00';
  return `${hour.padStart(2, '0')}:${minute}`;
};

const toPickerTime = (value) => {
  if (!value) return '';
  if (/^\d{2}:\d{2}$/.test(value)) return value;
  return toSortableTime(value);
};

const orderActivities = (activities) => {
  const timed = activities
    .filter((activity) => activity.time)
    .sort((first, second) => toSortableTime(first.time).localeCompare(toSortableTime(second.time)));
  let timedIndex = 0;
  return activities.map((activity) => (
    activity.time ? timed[timedIndex++] : activity
  ));
};

const formatDayHeading = (dateValue) => {
  try {
    return format(parseMDY(dateValue), 'EEEE, MMMM d');
  } catch {
    return dateValue;
  }
};

const getDuration = (startValue, endValue) => {
  if (!startValue || !endValue) return null;
  const start = parseMDY(startValue);
  const end = parseMDY(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
  return Math.round((end - start) / 86400000) + 1;
};

const pluralize = (count, singular, plural = `${singular}s`) => (
  `${count} ${count === 1 ? singular : plural}`
);

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

const getDraftStorageKey = (trip) => {
  const tripId = trip.id || trip.tripId || trip.sk;
  if (!tripId) return '';
  return `trek-a-trip:trip-draft:${trip.ownerId || trip.pk || 'owner'}:${tripId}`;
};

const recoverLocalDraft = (trip, storageKey) => {
  if (!storageKey || typeof window === 'undefined') return trip;
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey));
    if (stored?.trip) {
      const recovered = stored.baseTrip
        ? mergeTripDraft(stored.baseTrip, stored.trip, trip)
        : { ...trip, ...stored.trip };
      return { ...recovered, version: Number(trip.version ?? 0) };
    }
  } catch {
    window.localStorage.removeItem(storageKey);
  }
  return trip;
};

function TripFormContent({
  trip = {},
  onSave,
  onAutoSave,
  onAutoSaveError,
  onDone,
  onCancel,
  mapsEnabled = false,
}) {
  const { uploadTripImage } = useTripContext();
  const { user } = useAuth();
  const isEditing = Boolean(trip.id || trip.tripId || trip.sk);
  const draftStorageKey = useMemo(() => getDraftStorageKey(trip), [trip]);
  const initialTrip = useMemo(
    () => recoverLocalDraft(trip, draftStorageKey),
    [draftStorageKey, trip],
  );
  const [imageUrl, setImageUrl] = useState(initialTrip.imageUrl || '');
  const [destination, setDestination] = useState(initialTrip.destination || '');
  const [startDate, setStartDate] = useState(initialTrip.startDate || '');
  const [endDate, setEndDate] = useState(initialTrip.endDate || '');
  const [itinerary, setItinerary] = useState(
    ensureActivityIds(initialTrip.itinerary || []).map((day) => ({
      ...day,
      activities: orderActivities(day.activities || []),
    })),
  );
  const [newActivityTime, setNewActivityTime] = useState({});
  const [newActivityName, setNewActivityName] = useState({});
  const [newActivityLocation, setNewActivityLocation] = useState({});
  const [editingActivity, setEditingActivity] = useState(null);
  const [draggedActivity, setDraggedActivity] = useState(null);
  const [error, setError] = useState('');
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const [saveStatus, setSaveStatus] = useState(isEditing ? 'saved' : 'idle');
  const [showDockedActions, setShowDockedActions] = useState(false);
  const formRef = useRef(null);
  const essentialsRef = useRef(null);
  const actionsSlotRef = useRef(null);
  const actionsRef = useRef(null);
  const autosaveTimerRef = useRef(null);
  const saveChainRef = useRef(Promise.resolve());
  const savedVersionRef = useRef(Number(trip.version ?? 0));
  const saveFailedRef = useRef(false);
  const baseTripRef = useRef(trip);
  const currentDraftRef = useRef(null);
  const initialSignatureRef = useRef(tripDraftSignature(trip));
  const lastQueuedSignatureRef = useRef(initialSignatureRef.current);

  useEffect(() => {
    if (startDate && endDate) {
      const start = parseMDY(startDate);
      const end = parseMDY(endDate);

      if (end >= start) {
        const days = eachDayOfInterval({ start, end });
        setItinerary((previous) => {
          const previousByDate = Object.fromEntries(previous.map((day) => [day.date, day]));
          return days.map((date) => {
            const dateValue = format(date, 'MM/dd/yyyy');
            const existingDay = previousByDate[dateValue];
            return existingDay
              ? { ...existingDay, activities: orderActivities(existingDay.activities || []) }
              : { date: dateValue, activities: [] };
          });
        });
      } else {
        setItinerary([]);
      }
    } else {
      setItinerary([]);
    }
  }, [startDate, endDate]);

  const activityCount = useMemo(
    () => itinerary.reduce((total, day) => total + day.activities.length, 0),
    [itinerary],
  );
  const duration = getDuration(startDate, endDate);

  const handleAddActivity = (date) => {
    const time = newActivityTime[date];
    const name = newActivityName[date]?.trim();
    const location = newActivityLocation[date]?.trim() || '';
    if (!name) return;

    const formattedTime = time ? formatTime12Hour(time) : '';
    setItinerary((previous) => previous.map((day) => {
      if (day.date !== date) return day;
      const activities = orderActivities([
        ...day.activities,
        createActivity({ time: formattedTime, name, location }),
      ]);
      return { ...day, activities };
    }));
    setNewActivityTime((previous) => ({ ...previous, [date]: '' }));
    setNewActivityName((previous) => ({ ...previous, [date]: '' }));
    setNewActivityLocation((previous) => ({ ...previous, [date]: '' }));
  };

  const handleRemoveActivity = (date, index) => {
    setItinerary((previous) => previous.map((day) => (
      day.date === date
        ? { ...day, activities: day.activities.filter((_, activityIndex) => activityIndex !== index) }
        : day
    )));
    if (editingActivity?.date === date && editingActivity.index === index) {
      setEditingActivity(null);
    }
  };

  const startEditingActivity = (date, index, activity) => {
    setEditingActivity({
      date,
      index,
      name: activity.name,
      time: toPickerTime(activity.time),
      location: activity.location || '',
    });
  };

  const saveEditedActivity = () => {
    if (!editingActivity?.name.trim()) return;

    setItinerary((previous) => previous.map((day) => {
      if (day.date !== editingActivity.date) return day;
      const activities = day.activities.map((activity, index) => (
        index === editingActivity.index
          ? {
              ...activity,
              name: editingActivity.name.trim(),
              time: editingActivity.time ? formatTime12Hour(editingActivity.time) : '',
              location: editingActivity.location?.trim() || '',
              mapExcluded: editingActivity.location?.trim() ? false : activity.mapExcluded,
            }
          : activity
      ));
      return { ...day, activities: orderActivities(activities) };
    }));
    setEditingActivity(null);
  };

  const moveFlexibleActivity = (date, sourceIndex, targetIndex) => {
    setItinerary((previous) => previous.map((day) => {
      if (day.date !== date) return day;
      const sourceActivity = day.activities[sourceIndex];
      if (!sourceActivity || sourceActivity.time || targetIndex < 0 || targetIndex >= day.activities.length) {
        return day;
      }

      const activities = [...day.activities];
      const [moved] = activities.splice(sourceIndex, 1);
      activities.splice(targetIndex, 0, moved);
      return { ...day, activities: orderActivities(activities) };
    }));
  };

  const handleActivityDrop = (date, targetIndex) => {
    if (draggedActivity?.date === date) {
      moveFlexibleActivity(date, draggedActivity.index, targetIndex);
    }
    setDraggedActivity(null);
  };

  const handleImageChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsPreparingImage(true);
    try {
      const compressedFile = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1024,
        useWebWorker: true,
      });
      setSelectedImageFile(compressedFile);
      setImageUrl(URL.createObjectURL(compressedFile));
      if (isEditing) {
        const uploadedImageUrl = await uploadTripImage(
          compressedFile,
          destination || 'trip',
          trip.id || trip.tripId || trip.sk,
        );
        setImageUrl(uploadedImageUrl);
        setSelectedImageFile(null);
      }
    } catch (compressionError) {
      console.error('Image compression failed:', compressionError);
      if (isEditing) {
        setError('Unable to upload that photo. Your other changes are still safe.');
      } else {
        setSelectedImageFile(file);
        setImageUrl(URL.createObjectURL(file));
      }
    } finally {
      setIsPreparingImage(false);
    }
  };

  const currentDraft = useMemo(() => ({
    ...initialTrip,
    destination: destination.trim(),
    startDate,
    endDate,
    itinerary: itinerary.map((day) => ({
      date: day.date,
      activities: [...day.activities],
    })),
    imageUrl: selectedImageFile ? (initialTrip.imageUrl || '') : imageUrl,
    user: { userId: user?.userId },
  }), [destination, endDate, imageUrl, initialTrip, itinerary, selectedImageFile, startDate, user?.userId]);

  currentDraftRef.current = currentDraft;

  const queueAutosave = useCallback((draft, force = false) => {
    if (!isEditing || !onAutoSave) return saveChainRef.current;
    const signature = tripDraftSignature(draft);
    if (!force && signature === lastQueuedSignatureRef.current) return saveChainRef.current;
    lastQueuedSignatureRef.current = signature;
    saveFailedRef.current = false;

    saveChainRef.current = saveChainRef.current.catch(() => {}).then(async () => {
      setSaveStatus('saving');
      try {
        const savedTrip = await onAutoSave({ ...draft, version: savedVersionRef.current });
        savedVersionRef.current = Number(savedTrip?.version ?? savedVersionRef.current);
        if (savedTrip) baseTripRef.current = savedTrip;
        saveFailedRef.current = false;
        if (tripDraftSignature(currentDraftRef.current) === signature) {
          window.localStorage.removeItem(draftStorageKey);
          setSaveStatus('saved');
        } else {
          setSaveStatus('unsaved');
        }
        return savedTrip;
      } catch (autosaveError) {
        saveFailedRef.current = true;
        setSaveStatus('error');
        onAutoSaveError?.(autosaveError);
        return null;
      }
    });
    return saveChainRef.current;
  }, [draftStorageKey, isEditing, onAutoSave, onAutoSaveError]);

  useEffect(() => {
    if (!isEditing || !onAutoSave) return undefined;
    const signature = tripDraftSignature(currentDraft);
    if (signature === initialSignatureRef.current && signature === lastQueuedSignatureRef.current) {
      return undefined;
    }

    window.localStorage.setItem(draftStorageKey, JSON.stringify({
      serverVersion: savedVersionRef.current,
      updatedAt: new Date().toISOString(),
      baseTrip: baseTripRef.current,
      trip: currentDraft,
    }));
    setSaveStatus('unsaved');
    if (!currentDraft.destination || !currentDraft.startDate || !currentDraft.endDate) {
      return undefined;
    }
    window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => queueAutosave(currentDraft), 800);
    return () => window.clearTimeout(autosaveTimerRef.current);
  }, [currentDraft, draftStorageKey, isEditing, onAutoSave, queueAutosave]);

  useEffect(() => {
    if (!isEditing || saveStatus === 'saved') return undefined;
    const protectUnsyncedDraft = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectUnsyncedDraft);
    return () => window.removeEventListener('beforeunload', protectUnsyncedDraft);
  }, [isEditing, saveStatus]);

  useEffect(() => {
    const updateDockedActions = () => {
      const formBounds = formRef.current?.getBoundingClientRect();
      const essentialsBounds = essentialsRef.current?.getBoundingClientRect();
      const actionsBounds = actionsSlotRef.current?.getBoundingClientRect();
      if (!formBounds || !essentialsBounds) return;
      if (actionsBounds && actionsRef.current) {
        actionsRef.current.style.setProperty('--trip-actions-left', `${actionsBounds.left}px`);
        actionsRef.current.style.setProperty('--trip-actions-width', `${actionsBounds.width}px`);
      }
      const headerHeight = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--site-header-height'),
      ) || 72;
      const reachedActions = isEditing
        ? formBounds.top <= headerHeight + 56
        : essentialsBounds.bottom <= window.innerHeight - 24;
      const normalActionsAreVisible = formBounds.bottom <= window.innerHeight + 84;
      setShowDockedActions(reachedActions && !normalActionsAreVisible);
    };
    updateDockedActions();
    window.addEventListener('scroll', updateDockedActions, { passive: true });
    window.addEventListener('resize', updateDockedActions);
    return () => {
      window.removeEventListener('scroll', updateDockedActions);
      window.removeEventListener('resize', updateDockedActions);
    };
  }, [isEditing]);

  useEffect(() => {
    document.body.classList.toggle('trip-form-actions-docked', showDockedActions);
    return () => document.body.classList.remove('trip-form-actions-docked');
  }, [showDockedActions]);

  const handleDateChange = (nextStartDate, nextEndDate) => {
    const datesChanged = nextStartDate !== startDate || nextEndDate !== endDate;
    if (datesChanged && nextStartDate && nextEndDate) {
      const nextStart = parseMDY(nextStartDate);
      const nextEnd = parseMDY(nextEndDate);
      const removedPlannedDays = itinerary.filter((day) => {
        if (!day.activities?.length) return false;
        const dayDate = parseMDY(day.date);
        return dayDate < nextStart || dayDate > nextEnd;
      });
      if (removedPlannedDays.length) {
        const planCount = removedPlannedDays.reduce(
          (total, day) => total + day.activities.length,
          0,
        );
        const confirmed = window.confirm(
          `Changing these dates will remove ${pluralize(planCount, 'planned activity', 'planned activities')} from ${pluralize(removedPlannedDays.length, 'day')}. Continue?`,
        );
        if (!confirmed) return;
      }
    }
    setStartDate(nextStartDate);
    setEndDate(nextEndDate);
    if (error) setError('');
  };

  const handleDone = async () => {
    if (!destination.trim() || !startDate || !endDate) {
      setError('Please add a destination and both travel dates.');
      return;
    }
    setError('');
    window.clearTimeout(autosaveTimerRef.current);
    await queueAutosave(currentDraft, saveFailedRef.current);
    if (!saveFailedRef.current) onDone?.();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isEditing) {
      await handleDone();
      return;
    }
    if (!destination.trim() || !startDate || !endDate) {
      setError('Please add a destination and both travel dates.');
      return;
    }

    setError('');
    let finalImageUrl = imageUrl;
    if (selectedImageFile) {
      finalImageUrl = await uploadTripImage(
        selectedImageFile,
        destination || 'trip',
        trip.id || null,
      );
    }

    onSave({ ...currentDraft, imageUrl: finalImageUrl });
  };

  return (
    <form ref={formRef} className="trip-planner-form" onSubmit={handleSubmit} noValidate>
      <div className="trip-planner-intro">
        <div>
          <p>{isEditing ? 'Update your plans' : 'Build the basics'}</p>
          <h2>{isEditing ? 'Edit your trip' : 'Plan your trip'}</h2>
          <span>
            Start with the essentials, then add as much—or as little—structure as you want.
          </span>
        </div>
        <span className="visually-hidden">Add / Edit Trip</span>
      </div>

      {error && (
        <div className="trip-form-error" role="alert">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v6M12 17h.01" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      <div className="trip-planner-layout">
        <div className="trip-planner-main">
          <section ref={essentialsRef} className="trip-form-section" aria-labelledby="trip-essentials-heading">
            <header className="trip-form-section-heading">
              <span>01</span>
              <div>
                <h3 id="trip-essentials-heading">Trip essentials</h3>
                <p>Where are you headed, and when?</p>
              </div>
            </header>

            <div className="trip-form-fields">
              <div className="trip-form-field trip-form-field--destination">
                <label htmlFor="trip-destination">Destination</label>
                <div className="trip-form-input-wrap">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 21s7-6.1 7-12A7 7 0 0 0 5 9c0 5.9 7 12 7 12Z" />
                    <circle cx="12" cy="9" r="2.3" />
                  </svg>
                  <input
                    id="trip-destination"
                    type="text"
                    value={destination}
                    placeholder="Where do you want to go?"
                    autoComplete="off"
                    onChange={(event) => {
                      setDestination(event.target.value);
                      if (error) setError('');
                    }}
                  />
                </div>
              </div>

              <div className="trip-form-field trip-form-field--dates">
                <label htmlFor="trip-travel-dates">Travel dates</label>
                <TripDatePicker
                  id="trip-travel-dates"
                  startDate={startDate}
                  endDate={endDate}
                  placeholder="Choose your travel dates"
                  onChange={handleDateChange}
                />
                <small>Select your arrival date, then your departure date.</small>
              </div>
            </div>
          </section>

          <section className="trip-form-section" aria-labelledby="trip-itinerary-heading">
            <header className="trip-form-section-heading">
              <span>02</span>
              <div>
                <h3 id="trip-itinerary-heading">Itinerary</h3>
                <p>Add activities now, or leave room for spontaneity.</p>
              </div>
            </header>

            {itinerary.length === 0 ? (
              <div className="trip-form-itinerary-placeholder">
                <CalendarIcon />
                <div>
                  <h4>Your days will appear here.</h4>
                  <p>Choose valid start and end dates to begin shaping the itinerary.</p>
                </div>
              </div>
            ) : (
              <div className="trip-form-days">
                {itinerary.map((day, dayIndex) => (
                  <article className="trip-form-day border" key={day.date}>
                    <header className="trip-form-day-heading">
                      <span className="trip-form-day-number">Day {dayIndex + 1}</span>
                      <div>
                        <h4>{formatDayHeading(day.date)}</h4>
                        <p>{day.date}</p>
                      </div>
                      <span className="trip-form-day-count">
                        {pluralize(day.activities.length, 'plan')}
                      </span>
                    </header>

                    {day.activities.length > 0 ? (
                      <ul className="trip-form-activities">
                        {day.activities.map((activity, activityIndex) => {
                          const isFlexible = !activity.time;
                          const isEditingActivity = editingActivity?.date === day.date
                            && editingActivity.index === activityIndex;
                          return (
                            <li
                              className={`${isFlexible ? 'is-flexible' : 'is-timed'}${isEditingActivity ? ' is-editing' : ''}`}
                              key={activity.id}
                              draggable={isFlexible && !isEditingActivity}
                              onDragStart={(event) => {
                                if (!isFlexible) return;
                                event.dataTransfer.effectAllowed = 'move';
                                setDraggedActivity({ date: day.date, index: activityIndex });
                              }}
                              onDragOver={(event) => {
                                if (draggedActivity?.date === day.date) {
                                  event.preventDefault();
                                  event.dataTransfer.dropEffect = 'move';
                                }
                              }}
                              onDrop={() => handleActivityDrop(day.date, activityIndex)}
                              onDragEnd={() => setDraggedActivity(null)}
                            >
                              {isEditingActivity ? (
                                <div className="trip-form-activity-editor">
                                  <div className="trip-form-time-field">
                                    <span className="trip-form-mobile-label">Time · optional</span>
                                    <ActivityTimeSelect
                                      value={editingActivity.time}
                                      ariaLabel={`Edit time for ${activity.name}`}
                                      onChange={(value) => setEditingActivity((current) => ({
                                        ...current,
                                        time: value,
                                      }))}
                                    />
                                  </div>
                                  <div className="trip-form-activity-field">
                                    <label className="trip-form-mobile-label" htmlFor={`edit-activity-${dayIndex}-${activityIndex}`}>
                                      Activity
                                    </label>
                                    <input
                                      id={`edit-activity-${dayIndex}-${activityIndex}`}
                                      type="text"
                                      value={editingActivity.name}
                                      onChange={(event) => setEditingActivity((current) => ({
                                        ...current,
                                        name: event.target.value,
                                      }))}
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                          event.preventDefault();
                                          saveEditedActivity();
                                        }
                                        if (event.key === 'Escape') setEditingActivity(null);
                                      }}
                                      autoFocus
                                    />
                                  </div>
                                  <div className="trip-form-activity-field trip-form-location-field">
                                    <label className="trip-form-mobile-label" htmlFor={`edit-location-${dayIndex}-${activityIndex}`}>
                                      Map location · optional
                                    </label>
                                    {mapsEnabled ? (
                                      <PlaceAddressAutocomplete
                                        id={`edit-location-${dayIndex}-${activityIndex}`}
                                        type="text"
                                        value={editingActivity.location}
                                        placeholder="Venue or address"
                                        aria-describedby={`edit-location-help-${dayIndex}-${activityIndex}`}
                                        destination={destination}
                                        onChange={(value) => setEditingActivity((current) => ({
                                          ...current,
                                          location: value,
                                        }))}
                                        onKeyDown={(event) => {
                                          if (event.key === 'Enter') {
                                            event.preventDefault();
                                            saveEditedActivity();
                                          }
                                          if (event.key === 'Escape') setEditingActivity(null);
                                        }}
                                      />
                                    ) : (
                                      <input
                                        id={`edit-location-${dayIndex}-${activityIndex}`}
                                        type="text"
                                        value={editingActivity.location}
                                        placeholder="Venue or address"
                                        aria-describedby={`edit-location-help-${dayIndex}-${activityIndex}`}
                                        onChange={(event) => setEditingActivity((current) => ({
                                          ...current,
                                          location: event.target.value,
                                        }))}
                                        onKeyDown={(event) => {
                                          if (event.key === 'Enter') {
                                            event.preventDefault();
                                            saveEditedActivity();
                                          }
                                          if (event.key === 'Escape') setEditingActivity(null);
                                        }}
                                      />
                                    )}
                                  </div>
                                  <div className="trip-form-editor-actions">
                                    <button type="button" onClick={() => setEditingActivity(null)}>Cancel</button>
                                    <button
                                      type="button"
                                      className="is-primary"
                                      disabled={!editingActivity.name.trim()}
                                      onClick={saveEditedActivity}
                                    >
                                      Save
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  {isFlexible ? (
                                    <div className="trip-form-reorder-controls">
                                      <span className="trip-form-drag-handle" title="Drag to reorder" aria-hidden="true">
                                        <svg viewBox="0 0 24 24"><path d="M8 7h.01M8 12h.01M8 17h.01M16 7h.01M16 12h.01M16 17h.01" /></svg>
                                      </span>
                                      <div>
                                        <button
                                          type="button"
                                          disabled={activityIndex === 0}
                                          aria-label={`Move ${activity.name} earlier`}
                                          onClick={() => moveFlexibleActivity(day.date, activityIndex, activityIndex - 1)}
                                        >
                                          ↑
                                        </button>
                                        <button
                                          type="button"
                                          disabled={activityIndex === day.activities.length - 1}
                                          aria-label={`Move ${activity.name} later`}
                                          onClick={() => moveFlexibleActivity(day.date, activityIndex, activityIndex + 1)}
                                        >
                                          ↓
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="trip-form-reorder-placeholder" aria-hidden="true" />
                                  )}
                                  <button
                                    type="button"
                                    className="trip-form-activity-edit-trigger"
                                    onClick={() => startEditingActivity(day.date, activityIndex, activity)}
                                    aria-label={`Edit ${activity.name}`}
                                  >
                                    <span className={`trip-form-activity-time${isFlexible ? ' is-flexible' : ''}`}>
                                      {activity.time || 'Flexible'}
                                    </span>
                                    <span className="trip-form-activity-dot" aria-hidden="true" />
                                    <span className="trip-form-activity-name">{activity.name}</span>
                                    <svg className="trip-form-edit-icon" viewBox="0 0 24 24" aria-hidden="true">
                                      <path d="m5 16-.8 3.8L8 19l10-10-3-3L5 16ZM13.8 7.2l3 3" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    className="trip-form-remove-activity"
                                    onClick={() => handleRemoveActivity(day.date, activityIndex)}
                                    aria-label={`Remove ${activity.name} from day ${dayIndex + 1}`}
                                  >
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                      <path d="M6 6l12 12M18 6 6 18" />
                                    </svg>
                                  </button>
                                </>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="trip-form-day-empty">Nothing planned yet—this day is wide open.</p>
                    )}

                    <div className="trip-form-add-activity">
                      <div className="trip-form-time-field">
                        <span className="trip-form-mobile-label">Time · optional</span>
                        <ActivityTimeSelect
                          ariaLabel={`Activity time for day ${dayIndex + 1}`}
                          value={newActivityTime[day.date] || ''}
                          onChange={(value) => setNewActivityTime((previous) => ({
                            ...previous,
                            [day.date]: value,
                          }))}
                        />
                      </div>
                      <div className="trip-form-activity-field">
                        <span className="trip-form-mobile-label">Activity</span>
                        <input
                          type="text"
                          aria-label={`Activity description for day ${dayIndex + 1}`}
                          placeholder="Activity Description"
                          value={newActivityName[day.date] || ''}
                          onChange={(event) => setNewActivityName((previous) => ({
                            ...previous,
                            [day.date]: event.target.value,
                          }))}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              handleAddActivity(day.date);
                            }
                          }}
                        />
                      </div>
                      <div className="trip-form-activity-field trip-form-location-field">
                        <span className="trip-form-mobile-label">Map location · optional</span>
                        {mapsEnabled ? (
                          <PlaceAddressAutocomplete
                            type="text"
                            aria-label={`Map location for activity on day ${dayIndex + 1}`}
                            placeholder="Venue or address"
                            value={newActivityLocation[day.date] || ''}
                            destination={destination}
                            onChange={(value) => setNewActivityLocation((previous) => ({
                              ...previous,
                              [day.date]: value,
                            }))}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                handleAddActivity(day.date);
                              }
                            }}
                          />
                        ) : (
                          <input
                            type="text"
                            aria-label={`Map location for activity on day ${dayIndex + 1}`}
                            placeholder="Venue or address"
                            value={newActivityLocation[day.date] || ''}
                            onChange={(event) => setNewActivityLocation((previous) => ({
                              ...previous,
                              [day.date]: event.target.value,
                            }))}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                handleAddActivity(day.date);
                              }
                            }}
                          />
                        )}
                      </div>
                      <button
                        type="button"
                        className="trip-form-add-button"
                        onClick={() => handleAddActivity(day.date)}
                        disabled={!newActivityName[day.date]?.trim()}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                        <span>Add Activity</span>
                      </button>
                      <p className="trip-form-flexible-hint">
                        No time? Add it as flexible, then drag it anywhere in the day’s order.
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="trip-planner-sidebar">
          <section className="trip-photo-card" aria-labelledby="trip-photo-heading">
            <div className="trip-photo-preview">
              {imageUrl ? (
                <img
                  key={imageUrl}
                  src={imageUrl}
                  alt={destination ? `Cover for ${destination}` : 'Trip cover preview'}
                  onError={() => console.error('Image failed to load:', imageUrl)}
                />
              ) : (
                <div className="trip-photo-placeholder" aria-hidden="true">
                  <svg viewBox="0 0 48 48">
                    <path d="M8 35c4-10 10-9 13-18 3-7 9-9 19-8" />
                    <circle cx="8" cy="35" r="3" />
                    <path d="M39 5c-3.3 0-6 2.6-6 5.9 0 4.4 6 10.1 6 10.1s6-5.7 6-10.1C45 7.6 42.3 5 39 5Z" />
                  </svg>
                </div>
              )}
              {isPreparingImage && <span className="trip-photo-preparing">Preparing photo…</span>}
            </div>
            <div className="trip-photo-content">
              <p>03 · Optional</p>
              <h3 id="trip-photo-heading">Cover photo</h3>
              <span>Choose a photo that makes this trip easy to spot.</span>
              <label className="trip-photo-upload" htmlFor="trip-photo-input">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 16V4M7 9l5-5 5 5M5 14v5h14v-5" />
                </svg>
                {imageUrl ? 'Replace photo' : 'Choose photo'}
              </label>
              <input
                id="trip-photo-input"
                className="trip-photo-native-input"
                type="file"
                accept="image/*"
                onChange={handleImageChange}
              />
              <small>JPG, PNG, or WebP. Large files are compressed.</small>
            </div>
          </section>

          <section className="trip-form-summary" aria-label="Trip summary">
            <p>At a glance</p>
            <h3>{destination.trim() || 'Your next destination'}</h3>
            <dl>
              <div>
                <dt>Dates</dt>
                <dd>{startDate && endDate ? `${startDate} – ${endDate}` : 'Not set yet'}</dd>
              </div>
              <div>
                <dt>Length</dt>
                <dd>{duration ? pluralize(duration, 'day') : '—'}</dd>
              </div>
              <div>
                <dt>Plans</dt>
                <dd>{pluralize(activityCount, 'activity', 'activities')}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>

      <div ref={actionsSlotRef} className="trip-form-actions-slot">
        <footer
          ref={actionsRef}
          className={`trip-form-actions${isEditing ? ' is-editing' : ''}${showDockedActions ? ' is-docked' : ''}`}
        >
          <p className={`trip-form-save-status is-${saveStatus}`} role={isEditing ? 'status' : undefined}>
            {isEditing && saveStatus === 'saving' && 'Saving changes…'}
            {isEditing && saveStatus === 'saved' && 'All changes saved'}
            {isEditing && saveStatus === 'unsaved' && 'Changes safe on this device'}
            {isEditing && saveStatus === 'error' && 'Could not sync. Changes are safe on this device.'}
            {!isEditing && 'You can come back and refine your itinerary anytime.'}
          </p>
          <div>
            {!isEditing && (
              <button type="button" className="trip-form-cancel" onClick={onCancel}>
                Cancel
              </button>
            )}
            <button
              type={isEditing ? 'button' : 'submit'}
              className="trip-form-save"
              aria-label={isEditing ? 'Done editing' : 'Save trip'}
              disabled={isPreparingImage || (isEditing && saveStatus === 'saving')}
              onClick={isEditing ? handleDone : undefined}
            >
              <span>{isEditing ? 'Done' : 'Create trip'}</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h13M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </footer>
      </div>
    </form>
  );
}

export default function TripForm(props) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  if (!apiKey) return <TripFormContent {...props} />;

  return (
    <APIProvider apiKey={apiKey} version="beta">
      <TripFormContent {...props} mapsEnabled />
    </APIProvider>
  );
}
