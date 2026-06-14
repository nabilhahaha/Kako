import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BOTTOM_NAV_TABS, resolveBottomNavTabs, type BottomNavTab } from './bottom-nav-tabs';
import type { Permission } from '@/lib/erp/permissions';
import type { Module } from '@/lib/erp/navigation';

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
  it('the inventory tab(s) point at real stock routes, not the dead /inventory/products', () => {
    const invs = BOTTOM_NAV_TABS.filter((t) => t.labelKey === 'nav.bottom.inventory');
    expect(invs.length).toBeGreaterThan(0);
    for (const inv of invs) expect(inv.href).not.toBe('/inventory/products');
    // the generic (non-fashion) inventory tab is the real stock route
    expect(invs.some((t) => t.href === '/inventory')).toBe(true);
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

// ── Option A: module-aware Sell routing (clothing → Fashion POS) ──────────────
describe('bottom-nav — module-aware Sell routing', () => {
  const sellTabs = (tabs: BottomNavTab[]) => tabs.filter((t) => t.labelKey === 'nav.bottom.sell');
  const P = (...p: Permission[]) => p;
  const M = (...m: Module[]) => m;

  it('fashion-only clothing company → Sell opens /fashion/sell, never generic Sales', () => {
    const r = resolveBottomNavTabs({
      permissions: P('fashion.sell', 'customers.manage'), isSuperAdmin: false,
      modules: M('fashion', 'pos', 'warehousing'), businessType: 'clothing',
    });
    const sell = sellTabs(r);
    expect(sell).toHaveLength(1);
    expect(sell[0].href).toBe('/fashion/sell');
    // gated by the ENABLED `fashion` module ⇒ no `requireModule('sales')` upgrade redirect
    expect(sell[0].module).toBe('fashion');
    expect(r.some((t) => t.href === '/sales/invoices')).toBe(false);
  });

  it('generic sales company → Sell opens /sales/invoices', () => {
    const r = resolveBottomNavTabs({
      permissions: P('sales.sell'), isSuperAdmin: false,
      modules: M('sales', 'inventory'), businessType: 'general',
    });
    const sell = sellTabs(r);
    expect(sell).toHaveLength(1);
    expect(sell[0].href).toBe('/sales/invoices');
  });

  it('mixed clothing company (sales + fashion) → ONE Sell tab, prefers Fashion POS', () => {
    const r = resolveBottomNavTabs({
      permissions: P('sales.sell', 'fashion.sell'), isSuperAdmin: false,
      modules: M('sales', 'fashion'), businessType: 'clothing',
    });
    expect(sellTabs(r)).toHaveLength(1);
    expect(sellTabs(r)[0].href).toBe('/fashion/sell');
  });

  it('non-clothing company with both modules → prefers generic Sales (by business type)', () => {
    const r = resolveBottomNavTabs({
      permissions: P('sales.sell', 'fashion.sell'), isSuperAdmin: false,
      modules: M('sales', 'fashion'), businessType: 'general',
    });
    expect(sellTabs(r)).toHaveLength(1);
    expect(sellTabs(r)[0].href).toBe('/sales/invoices');
  });

  it('never renders two Sell tabs, regardless of business type', () => {
    for (const bt of ['clothing', 'general', null]) {
      const r = resolveBottomNavTabs({
        permissions: P('sales.sell', 'fashion.sell'), isSuperAdmin: false,
        modules: M('sales', 'fashion'), businessType: bt,
      });
      expect(sellTabs(r).length).toBeLessThanOrEqual(1);
    }
  });

  it('a company without sales OR fashion modules shows no Sell tab', () => {
    const r = resolveBottomNavTabs({
      permissions: P('sales.sell', 'fashion.sell'), isSuperAdmin: false,
      modules: M('inventory'), businessType: 'clothing',
    });
    expect(sellTabs(r)).toHaveLength(0);
  });

  it('empty modules (platform owner / legacy) is unrestricted and yields one Sell tab', () => {
    const r = resolveBottomNavTabs({ permissions: [], isSuperAdmin: true, modules: [], businessType: null });
    expect(sellTabs(r)).toHaveLength(1);
  });

  it('Van Sales rep → Sell opens the Van-Sell workflow, not the generic invoice editor', () => {
    const r = resolveBottomNavTabs({
      permissions: P('sales.sell', 'field.sales'), isSuperAdmin: false,
      modules: M('sales', 'van_sales', 'field_ops'), businessType: 'general',
      vanSalesActive: true,
    });
    const sell = sellTabs(r);
    expect(sell).toHaveLength(1);
    expect(sell[0].href).toBe('/field/van-sales/sell');
    // still exactly one Sell tab — the generic editor is collapsed away
    expect(r.some((t) => t.href === '/sales/invoices')).toBe(false);
  });

  it('Van Sales INACTIVE → the Van-Sell tab is hidden, Sell falls back to generic Sales', () => {
    const r = resolveBottomNavTabs({
      permissions: P('sales.sell', 'field.sales'), isSuperAdmin: false,
      modules: M('sales', 'van_sales', 'field_ops'), businessType: 'general',
      vanSalesActive: false,
    });
    const sell = sellTabs(r);
    expect(sell).toHaveLength(1);
    expect(sell[0].href).toBe('/sales/invoices');
    expect(r.some((t) => t.href === '/field/van-sales/sell')).toBe(false);
  });

  it('Van Sales active but rep lacks field.sales → no Van-Sell tab (perm-gated)', () => {
    const r = resolveBottomNavTabs({
      permissions: P('sales.sell'), isSuperAdmin: false,
      modules: M('sales'), businessType: 'general', vanSalesActive: true,
    });
    expect(sellTabs(r)).toHaveLength(1);
    expect(sellTabs(r)[0].href).toBe('/sales/invoices');
  });
});

describe('bottom-nav — Customers & Inventory tabs are Fashion-aware', () => {
  const hrefs = (tabs: BottomNavTab[], label: string) => tabs.filter((t) => t.labelKey === label).map((t) => t.href);
  const P = (...p: Permission[]) => p;
  const M = (...m: Module[]) => m;
  // a clothing manager via the fashion.manage umbrella holds the granular fashion.* perms
  const CLOTHING = { permissions: P('fashion.sell', 'fashion.inventory'), isSuperAdmin: false, modules: M('fashion'), businessType: 'clothing' };
  const GENERIC = { permissions: P('customers.manage', 'inventory.view'), isSuperAdmin: false, modules: M('sales', 'inventory'), businessType: 'general' };

  it('clothing → Customers opens /fashion/customers (never generic /customers)', () => {
    const r = resolveBottomNavTabs(CLOTHING);
    expect(hrefs(r, 'nav.bottom.customers')).toEqual(['/fashion/customers']);
    expect(r.some((t) => t.href === '/customers')).toBe(false);
  });
  it('clothing → Inventory opens /fashion/inventory (never generic /inventory upgrade screen)', () => {
    const r = resolveBottomNavTabs(CLOTHING);
    expect(hrefs(r, 'nav.bottom.inventory')).toEqual(['/fashion/inventory']);
    expect(r.some((t) => t.href === '/inventory')).toBe(false);
  });
  it('generic company keeps /customers and /inventory', () => {
    const r = resolveBottomNavTabs(GENERIC);
    expect(hrefs(r, 'nav.bottom.customers')).toEqual(['/customers']);
    expect(hrefs(r, 'nav.bottom.inventory')).toEqual(['/inventory']);
  });
  it('never shows two tabs for the same group', () => {
    for (const ctx of [CLOTHING, GENERIC]) {
      const r = resolveBottomNavTabs(ctx);
      expect(hrefs(r, 'nav.bottom.customers').length).toBeLessThanOrEqual(1);
      expect(hrefs(r, 'nav.bottom.inventory').length).toBeLessThanOrEqual(1);
    }
  });
  it('Van Sales rep → Inventory tab opens VAN stock (/field/stock), not the generic warehouse view', () => {
    const r = resolveBottomNavTabs({
      permissions: P('field.sales', 'inventory.view'), isSuperAdmin: false,
      modules: M('van_sales', 'inventory', 'field_ops'), businessType: 'general', vanSalesActive: true,
    });
    expect(hrefs(r, 'nav.bottom.inventory')).toEqual(['/field/stock']);
    expect(r.some((t) => t.href === '/inventory')).toBe(false);
  });
  it('Van Sales INACTIVE → Inventory falls back to the generic /inventory', () => {
    const r = resolveBottomNavTabs({
      permissions: P('field.sales', 'inventory.view'), isSuperAdmin: false,
      modules: M('van_sales', 'inventory', 'field_ops'), businessType: 'general', vanSalesActive: false,
    });
    expect(hrefs(r, 'nav.bottom.inventory')).toEqual(['/inventory']);
  });
  it('generic inventory tab no longer leaks to a tenant lacking the inventory module', () => {
    // salon-style tenant: has inventory.view perm but no inventory module → tab hidden (no upgrade screen)
    const r = resolveBottomNavTabs({ permissions: P('inventory.view', 'customers.manage'), isSuperAdmin: false, modules: M('salon', 'sales'), businessType: 'salon' });
    expect(r.some((t) => t.href === '/inventory')).toBe(false);
  });
});

// ── Unified salesman workspace: one operational entry (Today · Customer · Van Stock) ──
describe('bottom-nav — unified salesman workspace', () => {
  const P = (...p: Permission[]) => p;
  const M = (...m: Module[]) => m;
  // the cleaned FMCG salesman: field.sales, no settings.branches, no sales.sell
  const SALESMAN = {
    permissions: P('field.sales', 'inventory.view'), isSuperAdmin: false,
    modules: M('van_sales', 'inventory', 'field_ops'), businessType: 'general', vanSalesActive: true,
  };

  it('unified ON → Customer (picker) replaces Sell; Home is dropped', () => {
    const r = resolveBottomNavTabs({ ...SALESMAN, unifiedWorkspace: true });
    const hrefs = r.map((t) => t.href);
    expect(hrefs).toContain('/today');
    expect(hrefs).toContain('/field/van-sales/customers'); // Customer-first entry
    expect(hrefs).toContain('/field/stock');               // Van Stock
    expect(hrefs).not.toContain('/field/van-sales/sell');  // no standalone Sell
    expect(hrefs).not.toContain('/dashboard');             // no duplicate Home
  });

  it('unified OFF → unchanged (Home + Sell present, no picker tab)', () => {
    const r = resolveBottomNavTabs({ ...SALESMAN, unifiedWorkspace: false });
    const hrefs = r.map((t) => t.href);
    expect(hrefs).toContain('/dashboard');
    expect(hrefs).toContain('/field/van-sales/sell');
    expect(hrefs).not.toContain('/field/van-sales/customers');
  });

  it('the Customer picker tab never leaks to a non-unified user', () => {
    const r = resolveBottomNavTabs({ ...SALESMAN }); // unifiedWorkspace omitted (falsey)
    expect(r.some((t) => t.href === '/field/van-sales/customers')).toBe(false);
  });
});
