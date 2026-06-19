import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTisCustomer } from '../dataset';
import { balanceRoutes, validatePlanGeography, clusterTerritories } from '../optimize-routes';
import { PALETTE } from './svg';
import type { VisitFrequency } from '@/lib/route-optimization/visit-frequency';

const weekly: VisitFrequency = { unit: 'week', everyN: 1, visitsPerCycle: 1 };

/** Emits a before/after "screenshot" of the geography blocker fix: the SAME ~6000
 *  customers across Jeddah/Riyadh/Dammam, optimized with the OLD cross-territory pass
 *  (routes mix cities → invalid) vs the NEW hard-partition default (each route stays
 *  in one city → valid). Stand-in for a browser capture in this headless env. */
describe('geography optimize before/after (Jeddah / Riyadh / Dammam)', () => {
  it('writes docs/tis-demo/optimize-geography-before-after.svg', () => {
    const CITIES = { Jeddah: { lat: 21.54, lng: 39.19 }, Riyadh: { lat: 24.71, lng: 46.68 }, Dammam: { lat: 26.43, lng: 50.10 } };
    let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const make = (c: keyof typeof CITIES, n: number) => Array.from({ length: n }, (_, i) =>
      buildTisCustomer({ id: `${c}-${i}`, name: `${c}-${i}`, geo: { lat: CITIES[c].lat + (rnd() - 0.5) * 0.3, lng: CITIES[c].lng + (rnd() - 0.5) * 0.3 }, frequency: weekly, salesValue: 100 }));
    const all = [...make('Jeddah', 2200), ...make('Riyadh', 2000), ...make('Dammam', 1800)];

    const before = balanceRoutes(all, { routeCount: 8, crossTerritory: true });
    const after = balanceRoutes(all, { routeCount: 8 });
    const vBefore = validatePlanGeography(all, before.assignments);
    const vAfter = validatePlanGeography(all, after.assignments);

    const W = 920, H = 520, pad = 16, panelW = (W - pad * 3) / 2, panelH = H - 90;
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (const c of all) { minLat = Math.min(minLat, c.geo!.lat); maxLat = Math.max(maxLat, c.geo!.lat); minLng = Math.min(minLng, c.geo!.lng); maxLng = Math.max(maxLng, c.geo!.lng); }
    const spanLat = maxLat - minLat, spanLng = maxLng - minLng;

    const panel = (x0: number, title: string, assignments: typeof before.assignments, valid: boolean, invalid: number) => {
      const routeColor = new Map<string, string>();
      [...new Set(assignments.map((a) => a.routeId!))].sort().forEach((r, i) => routeColor.set(r, PALETTE[i % PALETTE.length]));
      const routeOf = new Map(assignments.map((a) => [a.customerId, a.routeId!]));
      const px = (lng: number) => x0 + 8 + ((lng - minLng) / spanLng) * (panelW - 16);
      const py = (lat: number) => 64 + 8 + (1 - (lat - minLat) / spanLat) * (panelH - 16);
      const parts = [
        `<rect x="${x0}" y="64" width="${panelW}" height="${panelH}" rx="6" fill="#ffffff" stroke="#e2e8f0"/>`,
        `<text x="${x0 + 8}" y="56" font-size="13" font-weight="700" fill="${valid ? '#16a34a' : '#dc2626'}">${title}</text>`,
        `<text x="${x0 + 8}" y="${64 + panelH + 16}" font-size="11" fill="${valid ? '#16a34a' : '#dc2626'}">${valid ? 'VALID' : 'INVALID'} · invalid routes: ${invalid}</text>`,
      ];
      for (const c of all) parts.push(`<circle cx="${px(c.geo!.lng).toFixed(1)}" cy="${py(c.geo!.lat).toFixed(1)}" r="2" fill="${routeColor.get(routeOf.get(c.id)!) ?? '#999'}" fill-opacity="0.7"/>`);
      for (const [name, ctr] of Object.entries(CITIES)) parts.push(`<text x="${px(ctr.lng).toFixed(0)}" y="${py(ctr.lat).toFixed(0)}" font-size="11" font-weight="700" fill="#0f172a" text-anchor="middle">${name}</text>`);
      return parts.join('');
    };

    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
      `<rect width="${W}" height="${H}" fill="#f8fafc"/>`,
      `<text x="${pad}" y="24" font-size="15" font-weight="700" fill="#0f172a">Optimization geography — BEFORE (cross-city) vs AFTER (hard partition) · 6000 customers</text>`,
      panel(pad, 'BEFORE — routes mix Jeddah/Riyadh/Dammam', before.assignments, vBefore.valid, vBefore.invalidCount),
      panel(pad * 2 + panelW, 'AFTER — each route stays in one city', after.assignments, vAfter.valid, vAfter.invalidCount),
      `</svg>`,
    ].join('');

    mkdirSync(resolve(process.cwd(), 'docs/tis-demo'), { recursive: true });
    writeFileSync(resolve(process.cwd(), 'docs/tis-demo/optimize-geography-before-after.svg'), svg);

    expect(clusterTerritories(all).size).toBeGreaterThan(0);
    expect(vAfter.valid).toBe(true);
    expect(vBefore.valid).toBe(false);
  });
});
