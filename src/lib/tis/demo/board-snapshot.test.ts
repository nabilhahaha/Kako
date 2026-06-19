import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildJeddahDemoDataset, } from './jeddah';
import { balanceRoutes } from '../optimize-routes';
import { applyScenario, scenarioMetrics } from '../scenario';
import { customerWorkload, type TisCustomer } from '../dataset';

const COVER_HEX: Record<string, string> = { on_track: '#16a34a', under_covered: '#d97706', over_covered: '#2563eb', never_visited: '#dc2626' };

/** Emits a static "screenshot" of the planning board (optimized 6-route plan) as
 *  SVG — a stand-in for a browser capture in this headless environment. */
describe('VTP-2 board snapshot (Jeddah demo)', () => {
  it('renders the optimized 6-route board to docs/tis-demo/jeddah-planning-board.svg', () => {
    const ds = buildJeddahDemoDataset();
    const plan = balanceRoutes(ds.customers, { routeCount: 6 });
    const m = scenarioMetrics(applyScenario(ds, { id: 'opt', name: 'opt', assignments: plan.assignments }));

    const byRoute = new Map<string, TisCustomer[]>(plan.routes.map((r) => [r.routeId, []]));
    const routeOf = new Map(plan.assignments.map((a) => [a.customerId, a.routeId!]));
    for (const c of ds.customers) byRoute.get(routeOf.get(c.id)!)!.push(c);

    const colW = 150, gap = 12, pad = 16, headerH = 70, colTop = headerH + 16, cardH = 13, maxCards = 24;
    const W = pad * 2 + plan.routes.length * (colW + gap), H = colTop + 40 + maxCards * (cardH + 2) + 30;
    const metricCells = [
      ['Customers', String(m.customers)], ['Visits/wk', String(m.visits)], ['Distance', `${(m.distanceM / 1000).toFixed(0)} km`],
      ['Workload bal.', `${m.routeBalancePct}%`], ['Value bal.', `${m.valueBalancePct}%`], ['Coverage', `${m.coveragePct}%`], ['Routes', String(m.routeCount)],
    ];
    const parts: string[] = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
      `<rect width="${W}" height="${H}" fill="#f8fafc"/>`,
      `<text x="${pad}" y="22" font-size="15" font-weight="700" fill="#0f172a">Territory Planning Board · Optimized (Jeddah demo, 500 customers)</text>`,
      `<rect x="${pad}" y="32" width="${W - pad * 2}" height="34" rx="6" fill="#ffffff" stroke="#e2e8f0"/>`,
      ...metricCells.map(([label, val], i) => {
        const x = pad + 12 + i * ((W - pad * 2 - 24) / metricCells.length);
        return `<text x="${x.toFixed(0)}" y="46" font-size="9" fill="#64748b">${label}</text><text x="${x.toFixed(0)}" y="60" font-size="13" font-weight="700" fill="#0f172a">${val}</text>`;
      }),
    ];
    plan.routes.forEach((r, i) => {
      const x = pad + i * (colW + gap);
      const list = byRoute.get(r.routeId)!;
      const workload = Math.round(list.reduce((s, c) => s + (customerWorkload(c) ?? 0), 0));
      parts.push(`<rect x="${x}" y="${colTop}" width="${colW}" height="${H - colTop - 12}" rx="6" fill="#ffffff" stroke="#e2e8f0"/>`);
      parts.push(`<text x="${x + 8}" y="${colTop + 18}" font-size="11" font-weight="700" fill="#0f172a">Route ${i + 1}</text>`);
      parts.push(`<text x="${x + 8}" y="${colTop + 32}" font-size="9" fill="#64748b">${r.customers} cust · ${workload}v · ${Math.round(r.salesValue / 1000)}k SAR</text>`);
      list.slice(0, maxCards).forEach((c, j) => {
        const cy = colTop + 42 + j * (cardH + 2);
        parts.push(`<rect x="${x + 6}" y="${cy}" width="${colW - 12}" height="${cardH}" rx="2" fill="#f8fafc" stroke="#e2e8f0"/><circle cx="${x + 13}" cy="${cy + cardH / 2}" r="3" fill="${COVER_HEX[c.coverage ?? ''] ?? '#cbd5e1'}"/><text x="${x + 20}" y="${cy + 9}" font-size="7.5" fill="#334155">${(c.grade ?? '').toUpperCase()} · ${escapeXml(c.name).slice(0, 18)}</text>`);
      });
      if (list.length > maxCards) parts.push(`<text x="${x + 8}" y="${colTop + 46 + maxCards * (cardH + 2)}" font-size="9" fill="#94a3b8">+${list.length - maxCards} more</text>`);
    });
    parts.push('</svg>');

    mkdirSync(resolve(process.cwd(), 'docs/tis-demo'), { recursive: true });
    writeFileSync(resolve(process.cwd(), 'docs/tis-demo/jeddah-planning-board.svg'), parts.join(''));
    expect(plan.routes).toHaveLength(6);
  });
});

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c] as string));
}
