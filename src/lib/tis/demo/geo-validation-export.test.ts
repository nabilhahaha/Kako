import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTisCustomer } from '../dataset';
import { balanceRoutes, validatePlanGeography } from '../optimize-routes';
import type { VisitFrequency } from '@/lib/route-optimization/visit-frequency';

const weekly: VisitFrequency = { unit: 'week', everyN: 1, visitsPerCycle: 1 };

/** Exports the geography VALIDATION RESULT (JSON + route-level CSV) for the
 *  6000-customer Jeddah/Riyadh/Dammam dataset — concrete UI/data evidence that the
 *  optimizer enforces geography as a hard constraint. */
describe('geography validation export (6000 customers)', () => {
  const CITIES = { Jeddah: { lat: 21.54, lng: 39.19 }, Riyadh: { lat: 24.71, lng: 46.68 }, Dammam: { lat: 26.43, lng: 50.10 } };
  let seed = 11; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const make = (c: keyof typeof CITIES, n: number) => Array.from({ length: n }, (_, i) =>
    buildTisCustomer({ id: `${c}-${i}`, name: `${c}-${i}`, geo: { lat: CITIES[c].lat + (rnd() - 0.5) * 0.3, lng: CITIES[c].lng + (rnd() - 0.5) * 0.3 }, frequency: weekly, salesValue: 100 }));
  const all = [...make('Jeddah', 2200), ...make('Riyadh', 2000), ...make('Dammam', 1800)];

  const dir = resolve(process.cwd(), 'docs/tis-demo');
  const routeCsv = (v: ReturnType<typeof validatePlanGeography>) =>
    ['routeId,customers,cities,radiusKm,status', ...v.routes.map((r) => `${r.routeId},${r.customers},${r.cities},${r.radiusKm},${r.valid ? 'valid' : 'INVALID'}`)].join('\n');

  it('VALID — default hard partition: no route mixes cities', () => {
    const plan = balanceRoutes(all, { routeCount: 8 });
    const v = validatePlanGeography(all, plan.assignments);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'validation-valid.json'), JSON.stringify(v, null, 2));
    writeFileSync(resolve(dir, 'validation-valid-routes.csv'), routeCsv(v));
    expect(v.valid).toBe(true);
    expect(v.invalidCount).toBe(0);
    expect(v.routes.every((r) => r.cities === 1)).toBe(true);
  });

  it('INVALID — expert cross-territory: routes span distant cities', () => {
    const plan = balanceRoutes(all, { routeCount: 8, crossTerritory: true });
    const v = validatePlanGeography(all, plan.assignments);
    writeFileSync(resolve(dir, 'validation-invalid.json'), JSON.stringify(v, null, 2));
    writeFileSync(resolve(dir, 'validation-invalid-routes.csv'), routeCsv(v));
    expect(v.valid).toBe(false);
    expect(v.invalidCount).toBeGreaterThan(0);
  });
});
