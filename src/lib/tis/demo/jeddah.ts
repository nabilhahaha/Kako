/**
 * TIS Demo Tenant — synthetic Jeddah FMCG dataset (permanent reference). Pure,
 * deterministic (seeded PRNG), no I/O. ~500 customers across the major Jeddah
 * sectors with realistic lat/lng, A/B/C/D grade mix, sales-value distribution, FR
 * visit frequencies, assigned/unassigned, and coverage states — a safe sandbox
 * for Territory Audit · Geo · Route Optimization · Visual Planning · Sales Force
 * Sizing. NOT a production/pilot tenant; this is an in-repo Mode-C reference.
 */
import { buildTisCustomer, buildTisDataset, type TisCustomer, type TisDataset } from '../dataset';
import { parseFrequency } from '@/lib/route-optimization/visit-frequency';
import type { CoverageStatus } from '@/lib/distribution/coverage-engine';

/** Deterministic PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Major Jeddah sectors: centre lat/lng + spread (deg) + relative weight. */
const SECTORS: { name: string; lat: number; lng: number; spread: number; weight: number }[] = [
  { name: 'Al-Balad', lat: 21.483, lng: 39.188, spread: 0.012, weight: 6 },
  { name: 'Al-Hamra', lat: 21.540, lng: 39.162, spread: 0.014, weight: 7 },
  { name: 'Al-Rawdah', lat: 21.580, lng: 39.172, spread: 0.016, weight: 9 },
  { name: 'Al-Salamah', lat: 21.600, lng: 39.160, spread: 0.016, weight: 8 },
  { name: 'Al-Naeem', lat: 21.620, lng: 39.135, spread: 0.014, weight: 6 },
  { name: 'Al-Shati', lat: 21.620, lng: 39.105, spread: 0.013, weight: 5 },
  { name: 'Al-Faisaliyah', lat: 21.520, lng: 39.182, spread: 0.013, weight: 7 },
  { name: 'Al-Aziziyah', lat: 21.500, lng: 39.210, spread: 0.015, weight: 7 },
  { name: 'Al-Safa', lat: 21.555, lng: 39.220, spread: 0.016, weight: 8 },
  { name: 'Al-Marwah', lat: 21.650, lng: 39.190, spread: 0.017, weight: 7 },
  { name: 'Al-Naseem', lat: 21.580, lng: 39.240, spread: 0.016, weight: 6 },
  { name: 'Obhur', lat: 21.745, lng: 39.100, spread: 0.020, weight: 5 },
  { name: 'Al-Khomrah', lat: 21.360, lng: 39.205, spread: 0.018, weight: 5 },
];

const GRADES = [
  { code: 'a', p: 0.15, freq: 'week/1/3', sales: [30000, 80000] },
  { code: 'b', p: 0.30, freq: 'week/1/2', sales: [10000, 30000] },
  { code: 'c', p: 0.45, freq: 'weekly', sales: [2000, 10000] },
  { code: 'd', p: 0.10, freq: 'biweekly', sales: [500, 2000] },
];

const COVERAGE: { s: CoverageStatus; p: number }[] = [
  { s: 'on_track', p: 0.55 }, { s: 'under_covered', p: 0.20 }, { s: 'never_visited', p: 0.15 }, { s: 'over_covered', p: 0.10 },
];

function pick<T extends { p: number }>(items: T[], r: number): T {
  let acc = 0;
  for (const it of items) { acc += it.p; if (r <= acc) return it; }
  return items[items.length - 1];
}

/** Build the ~500-customer Jeddah demo dataset. Deterministic. */
export function buildJeddahDemoDataset(count = 500, seed = 20260619): TisDataset {
  const rand = rng(seed);
  const totalWeight = SECTORS.reduce((s, x) => s + x.weight, 0);
  const SALESMEN = Array.from({ length: 8 }, (_, i) => `sm-${i + 1}`);
  const customers: TisCustomer[] = [];

  for (let i = 0; i < count; i++) {
    // Sector by weight.
    let w = rand() * totalWeight, si = 0;
    for (let s = 0; s < SECTORS.length; s++) { w -= SECTORS[s].weight; if (w <= 0) { si = s; break; } }
    const sec = SECTORS[si];
    // Gaussian-ish jitter around the sector centre (sum of uniforms).
    const jit = () => (rand() + rand() + rand() - 1.5) * sec.spread;
    const lat = sec.lat + jit();
    const lng = sec.lng + jit();

    const g = pick(GRADES, rand());
    const sales = Math.round(g.sales[0] + rand() * (g.sales[1] - g.sales[0]));
    // ~85% assigned (salesman + route by sector); ~15% unassigned (white-space).
    const assigned = rand() < 0.85;
    const salesmanId = assigned ? SALESMEN[si % SALESMEN.length] : null;
    const routeId = assigned ? `R-${sec.name}` : null;
    // Coverage: unassigned skew to never_visited; else weighted.
    const coverage: CoverageStatus = !assigned && rand() < 0.6 ? 'never_visited' : pick(COVERAGE, rand()).s;
    // Health derived from coverage (Mode-C reference): on-track healthy, never-visited critical.
    const healthBand: Record<CoverageStatus, [number, number]> = { on_track: [75, 95], over_covered: [65, 85], under_covered: [40, 65], never_visited: [10, 40] };
    const [hlo, hhi] = healthBand[coverage];
    const health = Math.round(hlo + rand() * (hhi - hlo));

    customers.push(buildTisCustomer({
      id: `JED-${String(i + 1).padStart(4, '0')}`,
      code: `JED-${String(i + 1).padStart(4, '0')}`,
      name: `${sec.name} Outlet ${i + 1}`,
      geo: { lat, lng },
      grade: g.code,
      frequency: parseFrequency(g.freq),
      salesValue: sales,
      coverage,
      health,
      ownership: { salesmanId, supervisorId: assigned ? 'sup-1' : null, areaId: 'jeddah', regionId: `region-${sec.name}`, routeId },
    }));
  }
  return buildTisDataset(customers, { source: 'upload', asOf: '2026-06-19' });
}
