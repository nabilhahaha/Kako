import { describe, it, expect } from 'vitest';
import {
  ENTITLEMENTS_ENABLED,
  parseEntitlement,
  entitlementActive,
  isEntitledIn,
  modulesForPermission,
  requiredEntitlementModules,
} from './index';
import type { CompanyEntitlement, CompanyEntitlementRow } from './types';

describe('entitlements/flags', () => {
  it('defaults OFF; on for 1/true', () => {
    const prev = process.env.KAKO_ENTITLEMENTS;
    delete process.env.KAKO_ENTITLEMENTS;
    expect(ENTITLEMENTS_ENABLED()).toBe(false);
    process.env.KAKO_ENTITLEMENTS = '1';
    expect(ENTITLEMENTS_ENABLED()).toBe(true);
    process.env.KAKO_ENTITLEMENTS = 'no';
    expect(ENTITLEMENTS_ENABLED()).toBe(false);
    if (prev === undefined) delete process.env.KAKO_ENTITLEMENTS; else process.env.KAKO_ENTITLEMENTS = prev;
  });
});

const row = (over: Partial<CompanyEntitlementRow>): CompanyEntitlementRow => ({
  company_id: 'c1', module_key: 'van_sales', feature_key: null, is_enabled: true,
  limit_value: null, limit_period: null, expires_at: null, ...over,
});
const ent = (over: Partial<CompanyEntitlement>): CompanyEntitlement => ({
  companyId: 'c1', moduleKey: 'van_sales', featureKey: null, isEnabled: true,
  limitValue: null, limitPeriod: null, expiresAt: null, ...over,
});

describe('entitlements/parse + active', () => {
  it('parses with defaults', () => {
    expect(parseEntitlement(row({ is_enabled: null }))).toMatchObject({ moduleKey: 'van_sales', isEnabled: false, featureKey: null });
  });
  it('entitlementActive honors enabled + expiry', () => {
    const now = 1_000_000;
    expect(entitlementActive(ent({ isEnabled: true }), now)).toBe(true);
    expect(entitlementActive(ent({ isEnabled: false }), now)).toBe(false);
    expect(entitlementActive(ent({ expiresAt: new Date(now - 1).toISOString() }), now)).toBe(false); // expired
    expect(entitlementActive(ent({ expiresAt: new Date(now + 10_000).toISOString() }), now)).toBe(true);
  });
});

describe('entitlements/isEntitledIn', () => {
  const now = 1_000_000;
  it('module-level: needs an active module row', () => {
    expect(isEntitledIn([ent({})], 'van_sales', null, now)).toBe(true);
    expect(isEntitledIn([ent({ isEnabled: false })], 'van_sales', null, now)).toBe(false);
    expect(isEntitledIn([], 'van_sales', null, now)).toBe(false);   // no row → not entitled
  });
  it('feature-level: module must be active; explicit feature row governs, else module', () => {
    const ents = [ent({ featureKey: null }), ent({ featureKey: 'direct_load', isEnabled: false })];
    expect(isEntitledIn(ents, 'van_sales', 'direct_load', now)).toBe(false);   // feature row disabled
    expect(isEntitledIn(ents, 'van_sales', 'physical_count', now)).toBe(true); // no feature row → module governs
    // module disabled → feature never entitled
    expect(isEntitledIn([ent({ isEnabled: false })], 'van_sales', 'physical_count', now)).toBe(false);
  });
});

describe('entitlements/modulesForPermission', () => {
  it('maps known permissions, empty for unmapped (never gated)', () => {
    expect(modulesForPermission('field.sales')).toEqual(['van_sales']);
    expect(modulesForPermission('change_requests.approve')).toEqual(['change_requests']);
    expect(modulesForPermission('route.create')).toEqual(['route_management']);
    expect(modulesForPermission('trade_spend.manage')).toEqual(['trade_spend']);
    expect(modulesForPermission('sales.sell')).toEqual([]);       // core → not entitlement-gated
    expect(modulesForPermission('inventory.view')).toEqual([]);   // core → not gated
  });
});

describe('entitlements/requiredEntitlementModules (gate decision)', () => {
  const co = { companyId: 'c1' };
  it('flag OFF → null (gate is a no-op = hasPermission)', () => {
    expect(requiredEntitlementModules('field.sales', co, false)).toBeNull();
  });
  it('platform owner / super admin → null', () => {
    expect(requiredEntitlementModules('field.sales', { ...co, isPlatformOwner: true }, true)).toBeNull();
    expect(requiredEntitlementModules('field.sales', { ...co, isSuperAdmin: true }, true)).toBeNull();
  });
  it('no company → null', () => {
    expect(requiredEntitlementModules('field.sales', { companyId: null }, true)).toBeNull();
  });
  it('unmapped (core) permission → null', () => {
    expect(requiredEntitlementModules('sales.sell', co, true)).toBeNull();
  });
  it('mapped engine permission + company + flag ON → the module(s)', () => {
    expect(requiredEntitlementModules('field.sales', co, true)).toEqual(['van_sales']);
    expect(requiredEntitlementModules('route.create', co, true)).toEqual(['route_management']);
  });
});
