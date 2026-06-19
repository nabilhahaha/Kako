import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildJeddahDemoDataset } from './jeddah';
import { PALETTE } from './svg';
import { balanceRoutes } from '../optimize-routes';
import { applyScenario, scenarioMetrics } from '../scenario';
import { isValidGeo } from '../dataset';

/** Emits a static "screenshot" of the Territory Intelligence Studio (STUDIO-1)
 *  map-centric layout — sub-nav · metrics strip · centre map coloured by the
 *  Optimize/Plan scenario routes — as a stand-in for a browser capture in this
 *  headless environment. */
describe('STUDIO-1 layout snapshot (Jeddah demo)', () => {
  it('renders the studio (Plan stage, 6-route scenario) to docs/tis-demo/jeddah-studio.svg', () => {
    const ds = buildJeddahDemoDataset();
    const plan = balanceRoutes(ds.customers, { routeCount: 6 });
    const applied = applyScenario(ds, { id: 'opt', name: 'opt', assignments: plan.assignments });
    const m = scenarioMetrics(applied);

    // Scenario route → colour (sorted route ids, same as routeColorMap).
    const routeIds = [...new Set(applied.customers.map((c) => c.ownership.routeId).filter((r): r is string => !!r))].sort();
    const color = new Map(routeIds.map((id, i) => [id, PALETTE[i % PALETTE.length]]));

    const W = 1040, H = 620, pad = 16;
    const navW = 150, gap = 14;
    const mapX = pad + navW + gap, mapY = 104, mapW = W - mapX - pad, mapH = H - mapY - pad;

    // Project geo customers into the map rect (equirectangular, north up).
    const geo = applied.customers.filter((c) => isValidGeo(c.geo));
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (const c of geo) { minLat = Math.min(minLat, c.geo!.lat); maxLat = Math.max(maxLat, c.geo!.lat); minLng = Math.min(minLng, c.geo!.lng); maxLng = Math.max(maxLng, c.geo!.lng); }
    const spanLat = Math.max(1e-6, maxLat - minLat), spanLng = Math.max(1e-6, maxLng - minLng);
    const px = (lng: number) => mapX + 10 + ((lng - minLng) / spanLng) * (mapW - 20);
    const py = (lat: number) => mapY + 10 + (1 - (lat - minLat) / spanLat) * (mapH - 20);

    const stages = ['Overview', 'Audit', 'Map', 'Optimize', 'Plan', 'Size'];
    const active = 'Plan';
    const metricCells: [string, string][] = [
      ['Customers', String(m.customers)], ['Visits/wk', String(m.visits)], ['Distance', `${(m.distanceM / 1000).toFixed(0)} km`],
      ['Workload bal.', `${m.routeBalancePct}%`], ['Value bal.', `${m.valueBalancePct}%`], ['Coverage', `${m.coveragePct}%`], ['Routes', String(m.routeCount)],
    ];

    const parts: string[] = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
      `<rect width="${W}" height="${H}" fill="#f8fafc"/>`,
      `<text x="${pad}" y="24" font-size="16" font-weight="700" fill="#0f172a">Territory Intelligence Studio · Plan (Jeddah demo, 500 customers)</text>`,
      // Metrics strip.
      `<rect x="${pad}" y="36" width="${W - pad * 2}" height="38" rx="6" fill="#ffffff" stroke="#e2e8f0"/>`,
      ...metricCells.map(([label, val], i) => {
        const x = pad + 14 + i * ((W - pad * 2 - 28) / metricCells.length);
        return `<text x="${x.toFixed(0)}" y="52" font-size="9" fill="#64748b">${label}</text><text x="${x.toFixed(0)}" y="67" font-size="14" font-weight="700" fill="#0f172a">${val}</text>`;
      }),
    ];

    // Sub-nav (vertical).
    stages.forEach((s, i) => {
      const y = mapY + i * 40;
      const on = s === active;
      parts.push(`<rect x="${pad}" y="${y}" width="${navW}" height="34" rx="6" fill="${on ? '#e0e7ff' : '#ffffff'}" stroke="${on ? '#6366f1' : '#e2e8f0'}"/>`);
      parts.push(`<text x="${pad + 14}" y="${y + 21}" font-size="12" font-weight="${on ? '700' : '500'}" fill="${on ? '#3730a3' : '#475569'}">${i + 1}. ${s}</text>`);
    });

    // Centre map.
    parts.push(`<rect x="${mapX}" y="${mapY}" width="${mapW}" height="${mapH}" rx="8" fill="#ffffff" stroke="#cbd5e1"/>`);
    for (const c of geo) {
      const col = c.ownership.routeId ? color.get(c.ownership.routeId) ?? '#94a3b8' : '#cbd5e1';
      parts.push(`<circle cx="${px(c.geo!.lng).toFixed(1)}" cy="${py(c.geo!.lat).toFixed(1)}" r="3.2" fill="${col}" fill-opacity="0.85"/>`);
    }
    // Route legend (top-right of map).
    routeIds.forEach((id, i) => {
      const lx = mapX + 12 + (i % 6) * 92, ly = mapY + 14 + Math.floor(i / 6) * 16;
      parts.push(`<rect x="${lx}" y="${ly - 9}" width="10" height="10" rx="2" fill="${color.get(id)}"/><text x="${lx + 14}" y="${ly}" font-size="10" fill="#334155">Route ${i + 1}</text>`);
    });
    parts.push('</svg>');

    mkdirSync(resolve(process.cwd(), 'docs/tis-demo'), { recursive: true });
    writeFileSync(resolve(process.cwd(), 'docs/tis-demo/jeddah-studio.svg'), parts.join(''));
    expect(routeIds).toHaveLength(6);
  });
});
