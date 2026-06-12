import { describe, it, expect } from 'vitest';
import { ALL_MODULES, isModuleGateOpen, visibleSections, type Module } from './navigation';
import type { Permission } from './permissions';

/**
 * Engine module-gate alignment (FMCG visibility patch). The six engine modules
 * (route_management, van_sales, trade_spend, merchandising, change_requests,
 * critical_alerts) are company/business-type driven — they gate their nav items
 * but must NOT be plan-gated. These guards assert:
 *   (a) isModuleGateOpen accepts each engine key (single + ANY-of with distribution);
 *   (b) ALL_MODULES does NOT contain them (the auth-context plan filter passes
 *       through keys outside ALL_MODULES, so they stay erp_company_modules-driven);
 *   (c) the gated items are hidden when both the distribution vertical AND the
 *       engine module are absent, and appear once the engine module is enabled —
 *       with zero regression for an existing distribution-only tenant.
 */

const ENGINE_KEYS: Module[] = [
  'route_management', 'van_sales', 'trade_spend', 'merchandising', 'change_requests', 'critical_alerts',
];

// Engine nav items and the flag tokens needed so the flag-gated ones can show.
const ENGINE_HREFS = [
  '/distribution/routes', '/distribution/van-accounting', '/distribution/trade-spend',
  '/distribution/perfect-store', '/distribution/perfect-store-scores', '/distribution/msl-compliance',
  '/distribution/assortment', '/distribution/grading', '/alerts', '/change-requests', '/settings/van-sales',
];
const ENGINE_FLAGS = ['alerts', 'change_requests', 'van_sales'];
const PERMS = ['reports.view', 'customers.manage', 'settings.branches'] as Permission[];

const hrefsOf = (sections: ReturnType<typeof visibleSections>) =>
  sections.flatMap((s) => s.items.map((i) => i.href));

describe('engine module gates', () => {
  it('(a) isModuleGateOpen accepts each engine key', () => {
    for (const k of ENGINE_KEYS) {
      expect(isModuleGateOpen([k], k)).toBe(true);                 // exact
      expect(isModuleGateOpen([k], ['distribution', k])).toBe(true); // ANY-of
      expect(isModuleGateOpen(['inventory'], k)).toBe(false);       // absent → closed
    }
  });

  it('(b) engine keys are NOT in ALL_MODULES (never plan-gated)', () => {
    for (const k of ENGINE_KEYS) expect(ALL_MODULES).not.toContain(k);
  });

  it('(c) engine items hidden when both distribution and the engine module are absent', () => {
    const sections = visibleSections(PERMS, false, false, ['sales', 'inventory'], [], false, null, ENGINE_FLAGS);
    const hrefs = hrefsOf(sections);
    for (const h of ENGINE_HREFS) expect(hrefs).not.toContain(h);
  });

  it('(c) engine items appear when their engine module is enabled (without the distribution vertical)', () => {
    const sections = visibleSections(PERMS, false, false, ENGINE_KEYS, [], false, null, ENGINE_FLAGS);
    const hrefs = hrefsOf(sections);
    for (const h of ENGINE_HREFS) expect(hrefs).toContain(h);
  });

  it('zero regression: a distribution-only tenant still sees the distribution screens', () => {
    const sections = visibleSections(PERMS, false, false, ['distribution'], [], false, null, ENGINE_FLAGS);
    const hrefs = hrefsOf(sections);
    expect(hrefs).toContain('/distribution/routes');
    expect(hrefs).toContain('/distribution/trade-spend');
    expect(hrefs).toContain('/distribution/grading');
  });
});
