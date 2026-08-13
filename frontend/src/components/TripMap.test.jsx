import { describe, expect, it } from 'vitest';
import { buildGoogleMapsUrl, getActivityLocationQueries, isConfidentPlaceMatch } from './tripMapUtils';

describe('TripMap helpers', () => {
  it('builds distinct geocoding queries from activity names and the trip destination', () => {
    expect(getActivityLocationQueries([
      { name: 'Louvre Museum' },
      { name: '  Eiffel Tower  ', location: 'Champ de Mars' },
      { name: 'louvre museum' },
      { name: 'Arc de Triomphe', mapExcluded: true },
      { name: '' },
    ], 'Paris')).toEqual([
      { activityIndex: 0, name: 'Louvre Museum', location: '', query: 'Louvre Museum, Paris' },
      { activityIndex: 1, name: 'Eiffel Tower', location: 'Champ de Mars', query: 'Champ de Mars, Paris' },
    ]);
  });

  it('creates a Google Maps directions link in activity order', () => {
    const url = new URL(buildGoogleMapsUrl([
      { position: { lat: 48.8606, lng: 2.3376 } },
      { position: { lat: 48.8584, lng: 2.2945 } },
      { position: { lat: 48.8529, lng: 2.3500 } },
    ]));

    expect(`${url.origin}${url.pathname}`).toBe('https://www.google.com/maps/dir/');
    expect(url.searchParams.get('origin')).toBe('48.8606,2.3376');
    expect(url.searchParams.get('waypoints')).toBe('48.8584,2.2945');
    expect(url.searchParams.get('destination')).toBe('48.8529,2.35');
  });

  it('creates a place link for a single mapped activity', () => {
    expect(buildGoogleMapsUrl([
      { position: { lat: 27.1751, lng: 78.0421 } },
    ])).toContain('/maps/search/?api=1&query=27.1751%2C78.0421');
  });

  it('rejects unrelated or vague automatic place matches', () => {
    expect(isConfidentPlaceMatch(
      { name: 'blabladfkjdsk' },
      { displayName: 'Black Rock Coffee Bar', formattedAddress: 'Paris, France' },
      'Paris',
    )).toBe(false);

    expect(isConfidentPlaceMatch(
      { name: 'Dinner' },
      { displayName: 'Chez Janou', formattedAddress: 'Paris, France' },
      'Paris',
    )).toBe(false);
  });

  it('accepts distinctive place-name matches and explicit user locations', () => {
    expect(isConfidentPlaceMatch(
      { name: 'Visit the Louvre Museum' },
      { displayName: 'Louvre Museum', formattedAddress: 'Rue de Rivoli, Paris' },
      'Paris',
    )).toBe(true);

    expect(isConfidentPlaceMatch(
      { name: 'Return rental' },
      {
        displayName: 'Enterprise Rent-A-Car',
        formattedAddress: 'Paris, France',
        primaryType: 'car_rental',
        types: ['car_rental', 'point_of_interest'],
      },
      'Paris',
    )).toBe(true);

    expect(isConfidentPlaceMatch(
      { name: 'Dinner', location: 'Chez Janou, Paris' },
      { displayName: 'Chez Janou', formattedAddress: 'Paris, France' },
      'Paris',
    )).toBe(true);
  });
});
