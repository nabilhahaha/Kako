import { describe, it, expect } from 'vitest';
import { visibleSections, routeModuleGate, isRouteModuleAllowed, type Module } from './navigation';
import type { Permission } from './permissions';

/**
 * Per-company feature enablement — UI enforcement proof.
 *
 * The Platform Owner toggles modules into erp_company_modules; auth-context resolves
 * the company's enabled `modules`, and the SAME list drives the sidebar
 * (`visibleSections`), the mobile bottom nav and the command palette. This test
 * reproduces exactly what the sidebar renders and asserts that when a module is
 * DISABLED its routes disappear from navigation, and when re-ENABLED they come back —
 * with the user holding the underlying RBAC permission the whole time (so we prove the
 * MODULE gate, not the permission gate, is doing the hiding).
 *
 * Mirrors the live smoke test on staging (company ZZ Smoke Test Co) where inventory /
 * pos / integrations were disabled and dropped out of the resolved module set.
 */

// A user who holds every permission the gated items require — so only the module
// flag can hide them.
const PERMS = [
  'inventory.view', 'sales.sell', 'integrations.manage',
] as Permission[];

const hrefsOf = (modules: Module[]) =>
  visibleSections(PERMS, false, false, modules, [], false, 'FMCG Distribution', [])
    .flatMap((s) => s.items.map((i) => i.href));

// Representative route per toggled module (see navigation.ts).
const GATED = {
  inventory: '/inventory',
  pos: '/sales/pos',
  integrations: '/settings/integrations',
} as const;

describe('per-company feature enablement → sidebar enforcement', () => {
  it('hides a module’s routes when it is disabled (permission still held)', () => {
    // Enabled set WITHOUT inventory / pos / integrations (the 3 disabled in the smoke test).
    const enabled: Module[] = ['sales', 'analytics', 'workflow', 'distribution'];
    const hrefs = hrefsOf(enabled);
    expect(hrefs).not.toContain(GATED.inventory);
    expect(hrefs).not.toContain(GATED.pos);
    expect(hrefs).not.toContain(GATED.integrations);
  });

  it('shows the same routes once the modules are re-enabled', () => {
    const enabled: Module[] = ['sales', 'analytics', 'workflow', 'distribution', 'inventory', 'pos', 'integrations'];
    const hrefs = hrefsOf(enabled);
    expect(hrefs).toContain(GATED.inventory);
    expect(hrefs).toContain(GATED.pos);
    expect(hrefs).toContain(GATED.integrations);
  });

  it('toggling one module does not affect the others', () => {
    const withoutPos: Module[] = ['sales', 'inventory', 'integrations', 'distribution'];
    const hrefs = hrefsOf(withoutPos);
    expect(hrefs).not.toContain(GATED.pos);          // disabled → hidden
    expect(hrefs).toContain(GATED.inventory);        // still enabled → visible
    expect(hrefs).toContain(GATED.integrations);     // still enabled → visible
  });
});

describe('direct-route module guard (URL-level block)', () => {
  it('maps a path to the module that guards it (most specific wins)', () => {
    expect(routeModuleGate('/inventory')).toBe('inventory');
    expect(routeModuleGate('/inventory/transfers')).toBe('warehousing'); // more specific than /inventory
    expect(routeModuleGate('/sales/pos')).toBe('pos');
    expect(routeModuleGate('/settings/integrations')).toBe('integrations');
    expect(routeModuleGate('/products')).toBe('inventory');
  });

  it('returns null for non-module-gated routes (always reachable)', () => {
    expect(routeModuleGate('/dashboard')).toBeNull();
    expect(routeModuleGate('/module-unavailable')).toBeNull();
    expect(routeModuleGate('/account')).toBeNull();
  });

  it('BLOCKS direct URL access to a disabled module', () => {
    const noInventory: Module[] = ['sales', 'analytics', 'distribution'];
    expect(isRouteModuleAllowed(noInventory, '/inventory')).toBe(false);
    expect(isRouteModuleAllowed(noInventory, '/inventory/low-stock')).toBe(false); // deep path too
    expect(isRouteModuleAllowed(noInventory, '/products')).toBe(false);

    const noPos: Module[] = ['sales', 'inventory'];
    expect(isRouteModuleAllowed(noPos, '/sales/pos')).toBe(false);

    const noIntegrations: Module[] = ['sales', 'inventory'];
    expect(isRouteModuleAllowed(noIntegrations, '/settings/integrations')).toBe(false);
  });

  it('ALLOWS direct URL access once the module is enabled', () => {
    expect(isRouteModuleAllowed(['inventory'], '/inventory')).toBe(true);
    expect(isRouteModuleAllowed(['inventory', 'warehousing'], '/inventory/transfers')).toBe(true);
    expect(isRouteModuleAllowed(['pos', 'sales'], '/sales/pos')).toBe(true);
    expect(isRouteModuleAllowed(['integrations'], '/settings/integrations')).toBe(true);
  });

  it('does not regress non-gated routes or legacy/unrestricted tenants', () => {
    expect(isRouteModuleAllowed(['sales'], '/dashboard')).toBe(true);   // non-gated route
    expect(isRouteModuleAllowed([], '/inventory')).toBe(true);          // empty = unrestricted (legacy/owner)
    expect(isRouteModuleAllowed([], '/sales/pos')).toBe(true);
  });
});
