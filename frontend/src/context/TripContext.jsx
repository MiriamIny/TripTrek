import { createContext, useContext, useState, useEffect } from 'react';
import { format, eachDayOfInterval, parse } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../context/AuthContext'; // adjust path as needed

const TripContext = createContext();

export const useTripContext = () => {
  const context = useContext(TripContext);
  if (!context) {
    throw new Error('useTripContext must be used within a TripProvider');
  }
  return context;
};

export const TripProvider = ({ children }) => {
  const API_Endpoint = 'https://f4ww6942k8.execute-api.us-east-1.amazonaws.com/';
  const { user } = useAuth(); // get userId from AuthContext
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);

  const parseMDY = str => parse(str, 'MM/dd/yyyy', new Date());

  const convertTo24Hour = timeStr => {
    const [time, mod] = timeStr.split(' ');
    let [h, m] = time.split(':');
    if (mod === 'PM' && h !== '12') h = String(+h + 12);
    if (mod === 'AM' && h === '12') h = '00';
    return `${h.padStart(2, '0')}:${m}`;
  };

  // RETRIEVE ALL trips for the current user
  const fetchTrips = async () => {
    if (!user?.userId) return;
    setLoading(true);
    console.log('Fetching trips for user:', user.userId);
    try {
      const response = await fetch(`${API_Endpoint}getTripList?userId=${user.userId}`, {
        method: 'GET',
      });
      if (!response.ok) throw new Error(`Failed to load trips: ${response.status}`);

      const data = await response.json();

      const tripsWithSortedItinerary = data.map(trip => ({
        ...trip,
        id: trip.sk, // tripId is now the sort key
        itinerary: trip.itinerary?.map(day => ({
          ...day,
          activities: [...(day.activities || [])].sort((a, b) => {
            const aTime = convertTo24Hour(a.time);
            const bTime = convertTo24Hour(b.time);
            return aTime.localeCompare(bTime);
          })
        })) || []
      }));

      setTrips(tripsWithSortedItinerary);
    } catch (err) {
      console.error('Error fetching trips:', err);
    } finally {
      setLoading(false);
    }
  };

  // DELETE a trip for the current user
  const deleteTrip = async (tripId) => {
    try {
      const response = await fetch(`${API_Endpoint}deleteTrip?userId=${user.userId}&tripId=${tripId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete trip. Status: ${response.status}`);
      }

      await fetchTrips();
    } catch (err) {
      console.error('Error deleting trip:', err);
      alert('Failed to delete trip. Please try again.');
    }
  };

  // UPDATE a trip attribute
  const updateTripAPI = async (tripId, attributeName, newValue) => {
  try {
    const res = await fetch(`${API_Endpoint}updateTrip?tripId=${encodeURIComponent(tripId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attributeName,
        newValue,
        user: { userId: user.userId } // ✅ include user object
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`API error: ${res.status} ${errText}`);
    }

    const result = await res.json();
    return result;
  } catch (err) {
    console.error('API call failed:', err);
  }
};


  // CREATE or UPDATE a trip
  const saveTrip = async (trip) => {
    const days = eachDayOfInterval({
      start: parseMDY(trip.startDate),
      end: parseMDY(trip.endDate)
    });

    const itinerary = days.map(date => {
      const dateStr = format(date, 'MM/dd/yyyy');
      const dayActivities = trip.itinerary.find(d => d.date === dateStr)?.activities || [];

      const sortedActivities = [...dayActivities].sort((a, b) => {
        const a24 = convertTo24Hour(a.time);
        const b24 = convertTo24Hour(b.time);
        return a24.localeCompare(b24);
      });

      return { date: dateStr, activities: sortedActivities };
    });

    const finalTrip = {
      ...trip,
      itinerary,
      user: { userId: user.userId }
    };

    if (trip.id) {
      const existingTrip = trips.find(t => t.id === trip.id);
      if (existingTrip) {
        if (existingTrip.destination !== trip.destination) {
          await updateTripAPI(trip.id, 'destination', finalTrip.destination);
          await updateTripAPI(trip.id, 'mapData', null) // reset mapData so it won't show old destination
        }
        if (existingTrip.startDate !== trip.startDate) {
          await updateTripAPI(trip.id, 'startDate', trip.startDate);
        }
        if (existingTrip.endDate !== trip.endDate) {
          await updateTripAPI(trip.id, 'endDate', trip.endDate);
        }

        if (existingTrip.mapData !== trip.mapData) {
          await updateTripAPI(trip.id, 'mapData', trip.mapData)
        }
        if (JSON.stringify(existingTrip.itinerary) !== JSON.stringify(finalTrip.itinerary)) {
          await updateTripAPI(trip.id, 'itinerary', finalTrip.itinerary);
        }
      }
    } else {
      finalTrip.id = uuidv4(); // generate tripId
      finalTrip.sk = finalTrip.id; // set sort key
      try {
        const response = await fetch(`${API_Endpoint}createTrip`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(finalTrip),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        alert('Trip created successfully!');
      } catch (error) {
        alert('Failed to create trip.');
      }
    }

    await fetchTrips();
  };

  const slugify = (text) =>
  text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')         // Replace spaces with -
    .replace(/[^\w\-]+/g, '')     // Remove non-word characters
    .replace(/\-\-+/g, '-');      // Replace multiple - with single -

  const uploadTripImage = async (file, locationName, tripId) => {
    const extension = file.name.split('.').pop();
    const safeBase = slugify(locationName || 'trip', { lower: true });
    const uniqueFileName = `${safeBase}/${uuidv4()}.${extension}`;
  
    const res = await fetch(`${API_Endpoint}generateUploadUrl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileType: file.type, fileName: uniqueFileName }),
    });
  
    if (!res.ok) {
      throw new Error('Failed to get upload URL');
    }
  
    const { uploadUrl, imageUrl } = await res.json();
  
    await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
  
    if (tripId) {
      await updateTripAPI(tripId, 'imageUrl', imageUrl);
      await fetchTrips();
    }
  
    return imageUrl;
  };

  // Get trip by ID

  const getTripById = (id) => {
    return trips.find(trip => trip.id === id);
  };

  useEffect(() => {
    if (user?.userId) {
      fetchTrips();
    }
  }, [user?.userId]);

  const value = {
    trips,
    loading,
    fetchTrips,
    deleteTrip,
    saveTrip,
    getTripById,
    uploadTripImage
  }

  return (
    <TripContext.Provider value={value}>
      {children}
    </TripContext.Provider>
  );
};
