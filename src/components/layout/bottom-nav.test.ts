import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BOTTOM_NAV_TABS } from './bottom-nav-tabs';

/**
 * Regression guard for the mobile bottom-nav "Inventory" 404 (BUG HUNT sprint):
 * the tab pointed at `/inventory/products`, a route that does not exist (the
 * catalog is `/products`, the stock view is `/inventory`), so tapping it 404'd.
 * These tests assert the tab targets the real route and — more generally — that
 * every bottom-nav destination resolves to an actual App Router page on disk,
 * so a future typo can't silently ship a dead tab.
 */

// repo root: this file lives at src/components/layout/bottom-nav.test.ts
const APP_ROOT = join(__dirname, '..', '..', 'app', '(app)');

/** A static href resolves if `(app)<href>/page.tsx` exists. */
function routeExists(href: string): boolean {
  return existsSync(join(APP_ROOT, ...href.split('/').filter(Boolean), 'page.tsx'));
}

describe('bottom-nav — route integrity', () => {
  it('the inventory tab points at the real stock route, not the dead /inventory/products', () => {
    const inv = BOTTOM_NAV_TABS.find((t) => t.labelKey === 'nav.bottom.inventory');
    expect(inv?.href).toBe('/inventory');
    expect(inv?.href).not.toBe('/inventory/products');
  });

  it('every bottom-nav tab resolves to an existing App Router page', () => {
    for (const tab of BOTTOM_NAV_TABS) {
      expect(routeExists(tab.href), `missing route for bottom-nav tab ${tab.href}`).toBe(true);
    }
  });

  it('home is always visible (no perm) and the rest are permission-gated', () => {
    const home = BOTTOM_NAV_TABS.find((t) => t.href === '/dashboard');
    expect(home?.perm).toBeUndefined();
    expect(BOTTOM_NAV_TABS.filter((t) => t.href !== '/dashboard').every((t) => !!t.perm)).toBe(true);
  });
});
