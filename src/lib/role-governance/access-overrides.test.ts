import { describe, it, expect } from 'vitest';
import {
  DELEGABLE_OPERATIONAL_PERMISSIONS,
  isDelegableOperationalPermission,
  isNonDelegablePermission,
  applyAccessOverrides,
  effectivePermissionsDiff,
  type AccessOverride,
} from './index';

describe('user access overrides — delegability', () => {
  it('all six operational permissions are delegable', () => {
    for (const p of DELEGABLE_OPERATIONAL_PERMISSIONS) {
      expect(isDelegableOperationalPermission(p)).toBe(true);
    }
  });

  it('non-operational / forbidden permissions are NOT delegable', () => {
    for (const p of [
      'platform.manage', 'security.audit', 'rls.bypass', 'super.admin',
      'integrations.manage', 'accounting.post', 'treasury.transfer',
      'settings.users', 'sales.sell', 'returns.approve', 'stock_request.approve',
    ]) {
      expect(isDelegableOperationalPermission(p)).toBe(false);
    }
  });

  it('deny-list classes are flagged regardless of any allowlist', () => {
    for (const p of ['platform.x', 'security.x', 'rls.x', 'treasury.x', 'super.admin', 'integrations.manage', 'accounting.post', 'settings.users']) {
      expect(isNonDelegablePermission(p)).toBe(true);
    }
    expect(isNonDelegablePermission('customer.request')).toBe(false);
  });
});

describe('user access overrides — application', () => {
  const base = ['sales.sell', 'returns.approve', 'returns.create'];

  it('grant adds a delegable operational permission', () => {
    const ov: AccessOverride[] = [{ permission: 'customer.request', effect: 'grant' }];
    const { effective } = applyAccessOverrides(base, ov);
    expect(effective).toContain('customer.request');
  });

  it('revoke removes a delegable operational permission the role had', () => {
    const ov: AccessOverride[] = [{ permission: 'returns.create', effect: 'revoke' }];
    const { effective } = applyAccessOverrides(base, ov);
    expect(effective).not.toContain('returns.create');
  });

  it('a non-delegable override is IGNORED (cannot grant returns.approve etc.)', () => {
    const ov: AccessOverride[] = [
      { permission: 'accounting.post', effect: 'grant' },
      { permission: 'returns.approve', effect: 'grant' },
      { permission: 'platform.manage', effect: 'grant' },
    ];
    const { effective, appliedGrants } = applyAccessOverrides(base, ov);
    expect(appliedGrants).toEqual([]);
    expect(effective).not.toContain('accounting.post');
    expect(effective).not.toContain('platform.manage');
    // returns.approve was already in base from the role — overrides must not have added it
    expect(effective.filter((p) => p === 'returns.approve')).toHaveLength(1);
  });

  it('output is always a subset of base ∪ delegable (never grants beyond)', () => {
    const ov: AccessOverride[] = [
      { permission: 'cash.handover.request', effect: 'grant' },
      { permission: 'super.admin', effect: 'grant' },
    ];
    const { effective } = applyAccessOverrides(base, ov);
    const allowed = new Set([...base, ...DELEGABLE_OPERATIONAL_PERMISSIONS]);
    for (const p of effective) expect(allowed.has(p)).toBe(true);
  });
});

describe('user access overrides — effective diff', () => {
  it('reports added grants and removed revokes that actually changed the set', () => {
    const base = ['returns.create', 'sales.sell'];
    const ov: AccessOverride[] = [
      { permission: 'customer.request', effect: 'grant' }, // genuinely added
      { permission: 'returns.create', effect: 'grant' },   // already present → not "added"
      { permission: 'returns.create', effect: 'revoke' },  // revoke wins via set math below
    ];
    // grant + revoke on same perm cannot both exist in storage (unique), but the
    // diff helper is pure; test with only the grant for clarity:
    const diff = effectivePermissionsDiff(base, [{ permission: 'customer.request', effect: 'grant' }, { permission: 'returns.create', effect: 'revoke' }]);
    expect(diff.addedByGrant).toContain('customer.request');
    expect(diff.removedByRevoke).toContain('returns.create');
    expect(diff.effective).toContain('customer.request');
    expect(diff.effective).not.toContain('returns.create');
    void ov;
  });
});
