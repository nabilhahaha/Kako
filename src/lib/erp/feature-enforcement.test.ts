import { describe, it, expect } from 'vitest';
import { visibleSections, type Module } from './navigation';
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
