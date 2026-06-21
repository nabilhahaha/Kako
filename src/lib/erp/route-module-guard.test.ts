import { describe, it, expect } from 'vitest';
import { routeModuleGate, isRouteModuleAllowed, type Module } from './navigation';

// Direct-route (URL-level) module guard. Counterpart to the sidebar's `visibleSections`:
// a disabled module must be blocked from direct URL access, not merely hidden from the
// nav. The mapping is derived from the same NAV_SECTIONS gates, so guard and nav cannot
// drift. These tests pin the mapping and the allow/deny decision.
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
