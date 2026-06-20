import { describe, it, expect } from 'vitest';
import { buildGeoLayers } from './geo';
import { auditTerritory } from './audit';
import { buildTisCustomer, buildTisDataset } from './dataset';
import type { VisitFrequency } from '@/lib/route-optimization/visit-frequency';

const weekly: VisitFrequency = { unit: 'week', everyN: 1, visitsPerCycle: 1 };
const geo = (i: number) => ({ lat: 24.7 + i * 0.01, lng: 46.7 + i * 0.01 });

function layersFor(customers: ReturnType<typeof buildTisCustomer>[]) {
  const ds = buildTisDataset(customers);
  return buildGeoLayers(ds, auditTerritory(ds));
}

describe('buildGeoLayers — Mode B (coverage present)', () => {
  const L = layersFor([
    buildTisCustomer({ id: 'a', name: 'A', geo: geo(1), grade: 'a', frequency: weekly, coverage: 'on_track', ownership: { salesmanId: 's1', regionId: 'G1', routeId: 'R1' } as never }),
    buildTisCustomer({ id: 'b', name: 'B', geo: geo(2), grade: 'c', frequency: weekly, coverage: 'never_visited', ownership: { salesmanId: 's1', regionId: 'G1', routeId: 'R1' } as never }),
    buildTisCustomer({ id: 'c', name: 'C', frequency: weekly, coverage: 'under_covered' }), // no geo → excluded from features
  ]);

  it('customer layer excludes geo-less customers + colours by grade', () => {
    expect(L.customers.features).toHaveLength(2);
    expect(L.customers.features.find((f) => f.id === 'a')!.color).toBe('#16a34a'); // grade a
  });
  it('coverage layer available + coloured by status', () => {
    expect(L.coverage.available).toBe(true);
    expect(L.coverage.features.find((f) => f.id === 'b')!.color).toBe('#dc2626'); // never_visited
  });
  it('ownership layer groups by salesman', () => {
    expect(L.ownership.available).toBe(true);
    const a = L.ownership.features.find((f) => f.id === 'a')!;
    const b = L.ownership.features.find((f) => f.id === 'b')!;
    expect(a.color).toBe(b.color); // same salesman ⇒ same colour
  });
  it('white-space layer flags un-worked (b is never_visited)', () => {
    expect(L.whitespace.available).toBe(true);
    expect(L.whitespace.features.find((f) => f.id === 'b')!.category).toBe('whitespace');
    expect(L.whitespace.features.find((f) => f.id === 'a')!.category).toBe('worked');
  });
  it('imbalance layer available with a territory section', () => {
    expect(L.imbalance.available).toBe(true);
    expect(L.imbalance.features.find((f) => f.id === 'a')!.color).toBeDefined();
  });
});

describe('buildGeoLayers — Mode A (no coverage) degrades', () => {
  const L = layersFor([
    buildTisCustomer({ id: 'a', name: 'A', geo: geo(1), grade: 'a', frequency: weekly, ownership: { salesmanId: 's1', routeId: 'R1' } as never }),
  ]);
  it('coverage layer unavailable, customer/ownership available', () => {
    expect(L.coverage.available).toBe(false);
    expect(L.coverage.features).toHaveLength(0);
    expect(L.customers.available).toBe(true);
    expect(L.ownership.available).toBe(true);
  });
});
