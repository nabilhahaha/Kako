import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildJeddahDemoDataset } from './jeddah';
import { pointsToSvg, PALETTE, type SvgPoint } from './svg';
import { auditTerritory } from '../audit';
import { resolveCapabilities } from '../capabilities';
import { balanceRoutes } from '../optimize-routes';
import { applyScenario, scenarioMetrics } from '../scenario';
import { balancePct } from '../balance';
import { COVERAGE_STATUS_VARIANT } from '@/lib/distribution/coverage-engine';
import type { TisCustomer } from '../dataset';

const COVER_HEX: Record<string, string> = { on_track: '#16a34a', under_covered: '#d97706', over_covered: '#2563eb', never_visited: '#dc2626' };

/**
 * TIS Demo Tenant — builds the permanent Jeddah reference dataset, runs Territory
 * Audit + the 4/6/8-route + value-balanced scenarios, and EMITS artifacts
 * (coverage + route SVG maps and a metrics report) to docs/tis-demo/. Also acts as
 * a regression test of the dataset shape. Deterministic.
 */
describe('TIS Demo Tenant — Jeddah', () => {
  const ds = buildJeddahDemoDataset();
  const byId = new Map(ds.customers.map((c) => [c.id, c]));
  const OUT = resolve(process.cwd(), 'docs/tis-demo');
  mkdirSync(OUT, { recursive: true });
  const geoPts = (color: (c: TisCustomer) => string): SvgPoint[] => ds.customers.filter((c) => c.geo).map((c) => ({ lat: c.geo!.lat, lng: c.geo!.lng, color: color(c) }));

  it('generates ~500 Mode-C Jeddah customers', () => {
    expect(ds.customers.length).toBe(500);
    expect(resolveCapabilities(ds).mode).toBe('C');
    expect(ds.customers.every((c) => c.geo && c.geo.lat > 21.2 && c.geo.lat < 21.9 && c.geo.lng > 39.0 && c.geo.lng < 39.4)).toBe(true);
  });

  it('emits the coverage map + a metrics report for 4/6/8/value scenarios', () => {
    const audit = auditTerritory(ds);

    // Coverage map.
    writeFileSync(resolve(OUT, 'jeddah-coverage.svg'),
      pointsToSvg(geoPts((c) => COVER_HEX[c.coverage ?? ''] ?? '#94a3b8'), {
        title: 'TIS Demo · Jeddah — Coverage (500 customers)',
        legend: (['on_track', 'under_covered', 'over_covered', 'never_visited'] as const).map((s) => ({ label: s, color: COVER_HEX[s] })),
      }));

    type Row = { name: string; routes: number; visits: number; salesValue: number; distanceKm: number; workloadBalance: number; valueBalance: number };
    const rows: Row[] = [];
    const scenarios: { name: string; count: number; by: 'workload' | 'value' }[] = [
      { name: '4 routes (workload)', count: 4, by: 'workload' },
      { name: '6 routes (workload)', count: 6, by: 'workload' },
      { name: '8 routes (workload)', count: 8, by: 'workload' },
      { name: '6 routes (value)', count: 6, by: 'value' },
    ];

    for (const sc of scenarios) {
      const plan = balanceRoutes(ds.customers, { routeCount: sc.count, balanceBy: sc.by });
      const routeOf = new Map(plan.assignments.map((a) => [a.customerId, a.routeId!]));
      const colorOf = (c: TisCustomer) => { const idx = plan.routes.findIndex((r) => r.routeId === routeOf.get(c.id)); return PALETTE[(idx + PALETTE.length) % PALETTE.length]; };
      writeFileSync(resolve(OUT, `jeddah-routes-${sc.count}-${sc.by}.svg`),
        pointsToSvg(geoPts(colorOf), {
          title: `TIS Demo · Jeddah — ${sc.name}`,
          legend: plan.routes.map((r, i) => ({ label: `Route ${i + 1} (${r.customers}c · ${r.workload}v · ${Math.round(r.salesValue / 1000)}k)`, color: PALETTE[i % PALETTE.length] })),
        }));
      const m = scenarioMetrics(applyScenario(ds, { id: sc.name, name: sc.name, assignments: plan.assignments }));
      rows.push({ name: sc.name, routes: m.routeCount, visits: m.visits, salesValue: m.salesValue, distanceKm: Math.round(m.distanceM / 100) / 10, workloadBalance: balancePct(plan.routes.map((r) => r.workload)), valueBalance: balancePct(plan.routes.map((r) => r.salesValue)) });
      expect(plan.assignments.length).toBe(500);
    }

    const md = [
      '# TIS Demo Tenant — Jeddah · Scenario Comparison',
      '', `Dataset: **500** synthetic Jeddah FMCG customers · Mode C (coverage populated).`,
      `Coverage: ${JSON.stringify(audit.headline)} `,
      '', '| Scenario | Routes | Visits/wk | Sales | Distance | Workload balance | Value balance |',
      '| :--- | ---: | ---: | ---: | ---: | ---: | ---: |',
      ...rows.map((r) => `| ${r.name} | ${r.routes} | ${r.visits} | ${r.salesValue.toLocaleString()} | ${r.distanceKm} km | ${r.workloadBalance}% | ${r.valueBalance}% |`),
      '', '## Maps', '- jeddah-coverage.svg', ...rows.map((r) => `- jeddah-routes map for: ${r.name}`),
    ].join('\n');
    writeFileSync(resolve(OUT, 'jeddah-scenarios.md'), md);

    expect(rows).toHaveLength(4);
    expect(byId.size).toBe(500);
  });
});
