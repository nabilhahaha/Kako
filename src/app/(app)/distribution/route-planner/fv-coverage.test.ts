import { describe, it, expect } from 'vitest';
import {
  coverageStatus, coverageColor, COVERAGE_COLOR, coverageCounters, coverageGeoJSON, coveragePhotoIds,
  type CoverageRow,
} from './fv-coverage';

const row = (over: Partial<CoverageRow> = {}): CoverageRow => ({
  customerId: 'c1', code: 'C1', name: 'Shop', city: 'Riyadh', area: 'North', channel: 'Grocery',
  salesman: 'rep@x.com', assignedRep: 'Rep One', lat: 24.7, lng: 46.7,
  datasetId: 'd1', datasetName: 'List', datasetStatus: 'active',
  visited: false, verifiedAt: null, distanceM: null, allowedRadiusM: null, radiusEnforced: null,
  outsidePhotoId: null, insidePhotoIds: [], notes: null, ...over,
});

describe('fv-coverage', () => {
  it('coverageStatus + color: visited→green, pending→red', () => {
    expect(coverageStatus({ visited: true })).toBe('visited');
    expect(coverageStatus({ visited: false })).toBe('pending');
    expect(coverageColor({ visited: true })).toBe(COVERAGE_COLOR.visited);
    expect(coverageColor({ visited: false })).toBe(COVERAGE_COLOR.pending);
  });

  it('coverageCounters: total / visited / pending / pct / photos', () => {
    const rows = [
      row({ customerId: 'a', visited: true, outsidePhotoId: 'o1' }),
      row({ customerId: 'b', visited: true, insidePhotoIds: ['i1'] }),
      row({ customerId: 'c', visited: false }),
      row({ customerId: 'd', visited: false }),
    ];
    expect(coverageCounters(rows)).toEqual({ total: 4, visited: 2, pending: 2, coveragePct: 50, photos: 2 });
    expect(coverageCounters([])).toEqual({ total: 0, visited: 0, pending: 0, coveragePct: 0, photos: 0 });
  });

  it('coverageGeoJSON: green/red props, [lng,lat], drops invalid coords', () => {
    const fc = coverageGeoJSON([
      row({ customerId: 'a', visited: true }),
      row({ customerId: 'b', visited: false }),
      row({ customerId: 'bad', lat: 0, lng: 0 }),
      row({ customerId: 'nocoord', lat: null, lng: null }),
    ]);
    expect(fc.features).toHaveLength(2);
    const a = fc.features.find((f) => f.properties.id === 'a')!;
    expect(a.geometry.coordinates).toEqual([46.7, 24.7]);
    expect(a.properties.status).toBe('visited');
    expect(a.properties.color).toBe(COVERAGE_COLOR.visited);
    expect(fc.features.find((f) => f.properties.id === 'b')!.properties.color).toBe(COVERAGE_COLOR.pending);
  });

  it('coveragePhotoIds: outside + inside, drops blanks', () => {
    expect(coveragePhotoIds({ outsidePhotoId: 'o', insidePhotoIds: ['i1', 'i2'] })).toEqual(['o', 'i1', 'i2']);
    expect(coveragePhotoIds({ outsidePhotoId: null, insidePhotoIds: [] })).toEqual([]);
    expect(coveragePhotoIds({ outsidePhotoId: '', insidePhotoIds: ['', 'i'] })).toEqual(['i']);
  });
});

import { coveragePointsGeoJSON, coverageSummaryPct, type CoveragePoint } from './fv-coverage';

const pt = (over: Partial<CoveragePoint> = {}): CoveragePoint => ({ customerId: 'c1', lat: 24.7, lng: 46.7, visited: false, ...over });

describe('coverageSummaryPct', () => {
  it('rounds visited/total', () => {
    expect(coverageSummaryPct({ total: 0, visited: 0 })).toBe(0);
    expect(coverageSummaryPct({ total: 4, visited: 1 })).toBe(25);
    expect(coverageSummaryPct({ total: 3, visited: 2 })).toBe(67);
  });
});

describe('coveragePointsGeoJSON', () => {
  it('builds green/red features and drops invalid coords; preserves order (green-on-top)', () => {
    const fc = coveragePointsGeoJSON([
      pt({ customerId: 'a', visited: false }),
      pt({ customerId: 'b', visited: true }),
      pt({ customerId: 'bad', lat: 0, lng: 0 }),
      pt({ customerId: 'null', lat: null, lng: null }),
    ]);
    expect(fc.features.map((f) => f.properties.id)).toEqual(['a', 'b']); // order preserved, invalid dropped
    expect(fc.features[0].properties.color).toBe(COVERAGE_COLOR.pending);
    expect(fc.features[1].properties.color).toBe(COVERAGE_COLOR.visited);
    expect(fc.features[1].geometry.coordinates).toEqual([46.7, 24.7]);
  });
});
