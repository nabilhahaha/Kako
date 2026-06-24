import { describe, it, expect } from 'vitest';
import {
  mapStatus, markerColor, FV_MARKER_COLOR, isValidLatLng, buildNavUrl, toMapGeoJSON, mapCounts,
  type FvMapPoint,
} from './fv-map-helpers';

const pt = (over: Partial<FvMapPoint> = {}): FvMapPoint => ({
  id: 'c1', code: 'C1', name: 'Shop', lat: 24.7, lng: 46.7, city: 'Riyadh', channel: 'Grocery',
  completed: false, lastVerifiedAt: null, ...over,
});

describe('fv-map-helpers', () => {
  it('mapStatus: completed → completed, else pending', () => {
    expect(mapStatus({ completed: true })).toBe('completed');
    expect(mapStatus({ completed: false })).toBe('pending');
  });

  it('markerColor: green for completed, red for pending', () => {
    expect(markerColor({ completed: true })).toBe(FV_MARKER_COLOR.completed);
    expect(markerColor({ completed: false })).toBe(FV_MARKER_COLOR.pending);
    expect(markerColor({ completed: true })).toMatch(/^#/);
  });

  it('isValidLatLng: bounds + finite + not 0,0', () => {
    expect(isValidLatLng(24.7, 46.7)).toBe(true);
    expect(isValidLatLng(0, 0)).toBe(false);
    expect(isValidLatLng(91, 10)).toBe(false);
    expect(isValidLatLng(10, 181)).toBe(false);
    expect(isValidLatLng(NaN, 10)).toBe(false);
  });

  it('buildNavUrl: google (default) and apple, embeds lat,lng; radius-independent', () => {
    expect(buildNavUrl(24.7, 46.7)).toBe('https://www.google.com/maps/dir/?api=1&destination=24.7,46.7');
    expect(buildNavUrl(24.7, 46.7, 'apple')).toBe('https://maps.apple.com/?daddr=24.7,46.7&dirflg=d');
  });

  it('toMapGeoJSON: shapes features [lng,lat], status+color props, drops invalid coords', () => {
    const fc = toMapGeoJSON([
      pt({ id: 'a', completed: true }),
      pt({ id: 'b', completed: false }),
      pt({ id: 'bad', lat: 0, lng: 0 }),
    ]);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(2); // bad 0,0 dropped
    const a = fc.features.find((f) => f.properties.id === 'a')!;
    expect(a.geometry.coordinates).toEqual([46.7, 24.7]); // [lng, lat]
    expect(a.properties.status).toBe('completed');
    expect(a.properties.color).toBe(FV_MARKER_COLOR.completed);
    expect(fc.features.find((f) => f.properties.id === 'b')!.properties.status).toBe('pending');
  });

  it('mapCounts: total / completed / pending', () => {
    expect(mapCounts([{ completed: true }, { completed: false }, { completed: true }])).toEqual({
      total: 3, completed: 2, pending: 1,
    });
    expect(mapCounts([])).toEqual({ total: 0, completed: 0, pending: 0 });
  });
});
