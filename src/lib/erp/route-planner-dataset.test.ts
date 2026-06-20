import { describe, it, expect } from 'vitest';
import { isValidDatasetCustomer, datasetBbox, splitDatasetColumns, countValid, DATASET_KNOWN_KEYS } from './route-planner-dataset';

describe('route-planner-dataset — validation', () => {
  it('valid requires a name + finite, non-(0,0) coordinates', () => {
    expect(isValidDatasetCustomer({ name: 'A', lat: 24.7, lng: 46.7 })).toBe(true);
    expect(isValidDatasetCustomer({ name: 'A', lat: 0, lng: 0 })).toBe(false);     // null island
    expect(isValidDatasetCustomer({ name: 'A', lat: 24.7, lng: null })).toBe(false);
    expect(isValidDatasetCustomer({ name: '', lat: 24.7, lng: 46.7 })).toBe(false); // no name
    expect(isValidDatasetCustomer({ name: 'A', lat: Number.NaN, lng: 46.7 })).toBe(false);
  });

  it('countValid counts only plannable rows', () => {
    const rows = [
      { name: 'A', lat: 24, lng: 46 },
      { name: 'B', lat: 0, lng: 0 },
      { name: 'C', lat: 25, lng: 47 },
      { name: '', lat: 25, lng: 47 },
    ];
    expect(countValid(rows)).toBe(2);
  });
});

describe('route-planner-dataset — bbox', () => {
  it('computes the bounding box over valid-geo rows only', () => {
    const bbox = datasetBbox([
      { name: 'A', lat: 24.5, lng: 46.5 },
      { name: 'B', lat: 21.5, lng: 39.2 },
      { name: 'C', lat: 0, lng: 0 },        // ignored
      { name: 'D', lat: 26.4, lng: 50.1 },
    ]);
    expect(bbox).toEqual({ minLat: 21.5, minLng: 39.2, maxLat: 26.4, maxLng: 50.1 });
  });

  it('returns null when no row has coordinates', () => {
    expect(datasetBbox([{ name: 'A' }, { name: 'B', lat: 0, lng: 0 }])).toBeNull();
  });
});

describe('route-planner-dataset — column split', () => {
  it('promotes known keys to columns and routes the long tail to attrs', () => {
    const { columns, attrs } = splitDatasetColumns({
      code: 'C1', name: 'Shop', lat: 24, lng: 46, salesman: 'S', route: 'R1',
      channel: 'GT', class: 'A', city: 'Riyadh', area: 'North', region: 'Central',
      phone: '0500', supervisor: 'sup1', sales: 1200, notes: '', empty: null,
    });
    expect(columns.code).toBe('C1');
    expect(columns.city).toBe('Riyadh');
    expect(attrs).toEqual({ phone: '0500', supervisor: 'sup1', sales: 1200 }); // notes '' + empty null dropped
    expect(Object.keys(attrs)).not.toContain('name'); // known key never leaks to attrs
  });

  it('every known key is a real column name (guards drift with the table)', () => {
    expect(DATASET_KNOWN_KEYS).toContain('lat');
    expect(DATASET_KNOWN_KEYS).toContain('region');
    expect(DATASET_KNOWN_KEYS.length).toBe(11);
  });
});
