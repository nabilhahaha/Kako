import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTisCustomer } from '../dataset';
import { balanceRoutes, validatePlanGeography } from '../optimize-routes';
import { PALETTE } from './svg';
import type { VisitFrequency } from '@/lib/route-optimization/visit-frequency';

const weekly: VisitFrequency = { unit: 'week', everyN: 1, visitsPerCycle: 1 };

/** Before/after for P1 (fragmentation + compactness): a Saudi-wide set (4 cities +
 *  scattered remote singletons), optimized with the legacy single-pass (crossTerritory)
 *  vs the new P1 default (absorb small/remote territories → exactly K → adjacency-aware
 *  compactness). Stand-in for a browser capture in this headless env. */
describe('P1 route allocation before/after (Saudi-wide)', () => {
  it('writes docs/tis-demo/optimize-p1-before-after.svg', () => {
    const CITIES = { Riyadh: { lat: 24.71, lng: 46.68 }, Jeddah: { lat: 21.54, lng: 39.19 }, Dammam: { lat: 26.43, lng: 50.10 }, Madinah: { lat: 24.47, lng: 39.61 } };
    let seed = 9; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const city = (c: keyof typeof CITIES, n: number) => Array.from({ length: n }, (_, i) =>
      buildTisCustomer({ id: `${c}-${i}`, name: `${c}-${i}`, geo: { lat: CITIES[c].lat + (rnd() - 0.5) * 0.3, lng: CITIES[c].lng + (rnd() - 0.5) * 0.3 }, frequency: weekly, salesValue: 100 }));
    // 30 remote outlets in the orbit of a city (~66–100 km out) — highway/outlier
    // points that P1-C should ABSORB into the nearest city rather than spawning routes.
    const ck = Object.keys(CITIES) as (keyof typeof CITIES)[];
    const remote = Array.from({ length: 30 }, (_, i) => {
      const c = CITIES[ck[i % ck.length]]; const ang = rnd() * Math.PI * 2; const r = 0.6 + rnd() * 0.3;
      return buildTisCustomer({ id: `remote-${i}`, name: `remote-${i}`, geo: { lat: c.lat + Math.cos(ang) * r, lng: c.lng + Math.sin(ang) * r }, frequency: weekly, salesValue: 100 });
    });
    const all = [...city('Riyadh', 1600), ...city('Jeddah', 1500), ...city('Dammam', 1300), ...city('Madinah', 1100), ...remote];

    const K = 20;
    const before = balanceRoutes(all, { routeCount: K, crossTerritory: true });
    const after = balanceRoutes(all, { routeCount: K });
    const vB = validatePlanGeography(all, before.assignments);
    const vA = validatePlanGeography(all, after.assignments);

    const W = 980, H = 560, pad = 16, panelW = (W - pad * 3) / 2, panelTop = 70, panelH = H - panelTop - 56;
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (const c of all) { minLat = Math.min(minLat, c.geo!.lat); maxLat = Math.max(maxLat, c.geo!.lat); minLng = Math.min(minLng, c.geo!.lng); maxLng = Math.max(maxLng, c.geo!.lng); }
    const spanLat = maxLat - minLat, spanLng = maxLng - minLng;

    const panel = (x0: number, title: string, assignments: typeof before.assignments, v: ReturnType<typeof validatePlanGeography>, gen: number, absorbed: number) => {
      const routeColor = new Map<string, string>();
      [...new Set(assignments.map((a) => a.routeId!))].sort().forEach((r, i) => routeColor.set(r, PALETTE[i % PALETTE.length]));
      const routeOf = new Map(assignments.map((a) => [a.customerId, a.routeId!]));
      const px = (lng: number) => x0 + 8 + ((lng - minLng) / spanLng) * (panelW - 16);
      const py = (lat: number) => panelTop + 8 + (1 - (lat - minLat) / spanLat) * (panelH - 16);
      const parts = [
        `<rect x="${x0}" y="${panelTop}" width="${panelW}" height="${panelH}" rx="6" fill="#ffffff" stroke="#e2e8f0"/>`,
        `<text x="${x0 + 8}" y="${panelTop - 8}" font-size="13" font-weight="700" fill="${v.valid ? '#16a34a' : '#dc2626'}">${title}</text>`,
        `<text x="${x0 + 8}" y="${panelTop + panelH + 16}" font-size="10.5" fill="#334155">routes ${gen}/${K} · absorbed ${absorbed} · singletons ${v.singletonRoutes} · invalid ${v.invalidCount}</text>`,
        `<text x="${x0 + 8}" y="${panelTop + panelH + 30}" font-size="10.5" fill="#334155">compactness ${v.compactnessScore} · maxR ${v.maxRouteRadiusKm}km · remote ${v.remoteCustomers}</text>`,
      ];
      for (const c of all) parts.push(`<circle cx="${px(c.geo!.lng).toFixed(1)}" cy="${py(c.geo!.lat).toFixed(1)}" r="1.7" fill="${routeColor.get(routeOf.get(c.id)!) ?? '#999'}" fill-opacity="0.7"/>`);
      for (const [name, ctr] of Object.entries(CITIES)) parts.push(`<text x="${px(ctr.lng).toFixed(0)}" y="${py(ctr.lat).toFixed(0)}" font-size="10" font-weight="700" fill="#0f172a" text-anchor="middle">${name}</text>`);
      return parts.join('');
    };

    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
      `<rect width="${W}" height="${H}" fill="#f8fafc"/>`,
      `<text x="${pad}" y="24" font-size="15" font-weight="700" fill="#0f172a">P1 route allocation — BEFORE (legacy single-pass) vs AFTER (absorb + exact-K + compact) · ${all.length} customers, K=${K}</text>`,
      panel(pad, 'BEFORE — legacy cross-territory', before.assignments, vB, before.routeCount, before.absorbedTerritories ?? 0),
      panel(pad * 2 + panelW, 'AFTER — P1 (default)', after.assignments, vA, after.routeCount, after.absorbedTerritories ?? 0),
      `</svg>`,
    ].join('');

    mkdirSync(resolve(process.cwd(), 'docs/tis-demo'), { recursive: true });
    writeFileSync(resolve(process.cwd(), 'docs/tis-demo/optimize-p1-before-after.svg'), svg);

    // P1 guarantees on the "after" plan (default): never exceeds K, never mixes cities,
    // no wasted singleton routes — and at least as clean as the legacy pass.
    expect(after.requestedRoutes).toBe(K);
    expect(after.routeCount).toBeLessThanOrEqual(K);
    expect(vA.valid).toBe(true);
    expect(vA.singletonRoutes).toBe(0);
    expect(vA.invalidCount).toBeLessThanOrEqual(vB.invalidCount);
    expect(vA.compactnessScore).toBeGreaterThan(0);
  });
});
