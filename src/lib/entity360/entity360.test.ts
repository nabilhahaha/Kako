import { describe, it, expect } from 'vitest';
import {
  ENTITY_360_ENABLED,
  ENTITY_360_PROFILES, getProfile,
  build360, visiblePanelKeys,
} from './index';
import type { SectionRule } from '@/lib/role-governance';

describe('entity360/flags', () => {
  it('defaults OFF', () => {
    const prev = process.env.KAKO_ENTITY360;
    delete process.env.KAKO_ENTITY360;
    expect(ENTITY_360_ENABLED()).toBe(false);
    process.env.KAKO_ENTITY360 = '1';
    expect(ENTITY_360_ENABLED()).toBe(true);
    if (prev === undefined) delete process.env.KAKO_ENTITY360; else process.env.KAKO_ENTITY360 = prev;
  });
});

describe('entity360/registry — unified profiles for every entity', () => {
  it('has profiles for customer/product/salesman/route/promotion + more', () => {
    for (const e of ['customer', 'product', 'category', 'brand', 'salesman', 'supervisor', 'area_manager', 'region', 'route', 'promotion'] as const) {
      expect(getProfile(e)).toBeDefined();
    }
    expect(ENTITY_360_PROFILES.length).toBe(10);
    expect(getProfile('product')!.label).toBe('SKU 360');
  });
});

describe('entity360/build — role section security (reuses role-governance)', () => {
  it('no rules → profile defaults (defaultVisible)', () => {
    const v = build360('customer', 'C1', ['salesman'], []);
    expect(v!.label).toBe('Customer 360');
    expect(visiblePanelKeys(v!)).toContain('orders');
    expect(visiblePanelKeys(v!)).not.toContain('profitability'); // defaultVisible=false
  });

  it('section rules gate panels per role', () => {
    const rules: SectionRule[] = [
      { role: 'salesman', entity: 'customer', section: 'profitability', visible: false },
      { role: 'manager', entity: 'customer', section: 'profitability', visible: true },
      { role: 'salesman', entity: 'customer', section: 'orders', visible: true },
    ];
    const sales = build360('customer', 'C1', ['salesman'], rules);
    expect(visiblePanelKeys(sales!)).toContain('orders');
    expect(visiblePanelKeys(sales!)).not.toContain('profitability');
    const mgr = build360('customer', 'C1', ['salesman', 'manager'], rules);
    expect(visiblePanelKeys(mgr!)).toContain('profitability'); // manager granted
  });

  it('unknown entity → null', () => {
    // @ts-expect-error testing unknown entity
    expect(build360('unknown', 'X', [], [])).toBeNull();
  });
});
