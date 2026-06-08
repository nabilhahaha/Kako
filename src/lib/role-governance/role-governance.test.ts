import { describe, it, expect } from 'vitest';
import {
  ROLE_GOVERNANCE_ENABLED,
  resolveScopeFilter, isVisible, applyScope, type UserPosition, type ScopedRecord,
  resolveApprovalAuthority, type ApprovalRule,
  canPerform, resolveFieldAccess, canEditField, visibleSections,
  isGrantActive, activeGrants, partitionGrantKeys, type TemporaryGrant,
} from './index';

const pos: UserPosition = { userId: 'U1', teamUserIds: ['U2'], areaId: 'A1', regionId: 'R1', branchId: 'B1', companyId: 'CO1' };
const recs: ScopedRecord[] = [
  { ownerUserId: 'U1', areaId: 'A1', regionId: 'R1', branchId: 'B1', companyId: 'CO1' },
  { ownerUserId: 'U2', areaId: 'A1', regionId: 'R1', branchId: 'B1', companyId: 'CO1' },
  { ownerUserId: 'U3', areaId: 'A2', regionId: 'R1', branchId: 'B2', companyId: 'CO1' },
  { ownerUserId: 'U9', areaId: 'A1', regionId: 'R1', branchId: 'B1', companyId: 'CO2' }, // other company
];

describe('role-governance/flags', () => {
  it('defaults OFF', () => {
    const prev = process.env.KAKO_ROLE_GOVERNANCE;
    delete process.env.KAKO_ROLE_GOVERNANCE;
    expect(ROLE_GOVERNANCE_ENABLED()).toBe(false);
    process.env.KAKO_ROLE_GOVERNANCE = '1';
    expect(ROLE_GOVERNANCE_ENABLED()).toBe(true);
    if (prev === undefined) delete process.env.KAKO_ROLE_GOVERNANCE; else process.env.KAKO_ROLE_GOVERNANCE = prev;
  });
});

describe('data scope engine', () => {
  it('own sees only own; team sees own + reports; company sees all (same tenant)', () => {
    expect(applyScope(recs, 'own', pos)).toHaveLength(1);
    expect(applyScope(recs, 'team', pos).map((r) => r.ownerUserId).sort()).toEqual(['U1', 'U2']);
    expect(applyScope(recs, 'area', pos).map((r) => r.ownerUserId).sort()).toEqual(['U1', 'U2']); // area A1
    expect(applyScope(recs, 'region', pos)).toHaveLength(3); // R1, same company
    expect(applyScope(recs, 'company', pos)).toHaveLength(3); // never the CO2 row
  });
  it('hard multi-tenant boundary: never another company', () => {
    const f = resolveScopeFilter('company', pos);
    expect(isVisible(f, recs[3], pos)).toBe(false);
  });
});

describe('approval authority (configurable thresholds)', () => {
  const rules: ApprovalRule[] = [
    { dimension: 'discount_pct', threshold: 10, authorityRole: 'area_manager' },
    { dimension: 'discount_pct', threshold: 20, authorityRole: 'regional_manager' },
    { dimension: 'discount_pct', threshold: 30, authorityRole: 'gm' },
  ];
  it('escalates by threshold (most senior wins)', () => {
    expect(resolveApprovalAuthority(rules, { dimension: 'discount_pct', value: 15 }).authorityRole).toBe('area_manager');
    expect(resolveApprovalAuthority(rules, { dimension: 'discount_pct', value: 25 }).authorityRole).toBe('regional_manager');
    expect(resolveApprovalAuthority(rules, { dimension: 'discount_pct', value: 35 }).authorityRole).toBe('gm');
    expect(resolveApprovalAuthority(rules, { dimension: 'discount_pct', value: 5 }).required).toBe(false);
  });
});

describe('action + field + section security', () => {
  it('action security is separate from visibility', () => {
    expect(canPerform(['order.create'], 'order.create')).toBe(true);
    expect(canPerform(['order.create'], 'order.approve')).toBe(false);
  });
  it('field security: most-permissive across roles; hidden by default', () => {
    const rules = [
      { role: 'salesman', field: 'margin', access: 'hidden' as const },
      { role: 'manager', field: 'margin', access: 'view' as const },
      { role: 'manager', field: 'customer_name', access: 'edit' as const },
    ];
    expect(resolveFieldAccess(rules, ['salesman'], 'margin')).toBe('hidden');
    expect(resolveFieldAccess(rules, ['salesman', 'manager'], 'margin')).toBe('view');
    expect(canEditField(rules, ['manager'], 'customer_name')).toBe(true);
    expect(resolveFieldAccess(rules, ['salesman'], 'unknown')).toBe('hidden');
  });
  it('Entity-360 section security per role', () => {
    const rules = [
      { role: 'salesman', entity: 'customer', section: 'orders', visible: true },
      { role: 'salesman', entity: 'customer', section: 'profitability', visible: false },
      { role: 'manager', entity: 'customer', section: 'profitability', visible: true },
    ];
    expect(visibleSections(rules, ['salesman'], 'customer')).toEqual(['orders']);
    expect(visibleSections(rules, ['salesman', 'manager'], 'customer').sort()).toEqual(['orders', 'profitability']);
  });
});

describe('temporary access (effective-dated, auto-expiry)', () => {
  const grants: TemporaryGrant[] = [
    { userId: 'U1', grant: 'acting_supervisor', effectiveFrom: '2026-06-01T00:00:00Z', effectiveTo: '2026-06-30T00:00:00Z' },
    { userId: 'U1', grant: 'finance_review', effectiveFrom: '2026-01-01T00:00:00Z', effectiveTo: '2026-02-01T00:00:00Z' },
  ];
  it('grants auto-expire by time', () => {
    expect(isGrantActive(grants[0], '2026-06-15T00:00:00Z')).toBe(true);
    expect(isGrantActive(grants[1], '2026-06-15T00:00:00Z')).toBe(false);
    expect(activeGrants(grants, 'U1', '2026-06-15T00:00:00Z')).toEqual(['acting_supervisor']);
    expect(activeGrants(grants, 'U1', '2026-12-15T00:00:00Z')).toEqual([]);
  });

  it('partitionGrantKeys splits permission keys from role keys (deduped)', () => {
    const allPerms = ['reports.view', 'sales.collect', 'inventory.view'];
    const { perms, roleKeys } = partitionGrantKeys(
      ['reports.view', 'acting_supervisor', 'sales.collect', 'reports.view', 'finance_review'],
      allPerms,
    );
    expect(perms.sort()).toEqual(['reports.view', 'sales.collect']);
    expect(roleKeys.sort()).toEqual(['acting_supervisor', 'finance_review']);
  });
});
