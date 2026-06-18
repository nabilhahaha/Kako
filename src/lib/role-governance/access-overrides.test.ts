import { describe, it, expect } from 'vitest';
import {
  DELEGABLE_OPERATIONAL_PERMISSIONS,
  isDelegableOperationalPermission,
  isNonDelegablePermission,
  applyAccessOverrides,
  effectivePermissionsDiff,
  effectivePermissionsDiffLayered,
  groupOperationalPermissions,
  type AccessOverride,
} from './index';

describe('role + user overrides — layered resolution (user wins)', () => {
  it('role grant adds for everyone; user revoke removes for that user', () => {
    // Salesman role lacks customer.request; role grant adds it; Ahmed has a user revoke.
    const baseline = ['sales.sell'];
    const roleOv: AccessOverride[] = [{ permission: 'customer.request', effect: 'grant' }];
    const userOv: AccessOverride[] = [{ permission: 'customer.request', effect: 'revoke' }];
    const d = effectivePermissionsDiffLayered(baseline, roleOv, userOv);
    expect(d.afterRole).toContain('customer.request');     // role granted it
    expect(d.roleAdded).toEqual(['customer.request']);
    expect(d.effective).not.toContain('customer.request'); // user revoke wins
    expect(d.userRemoved).toEqual(['customer.request']);
  });

  it('without a user override, the role override stands', () => {
    const d = effectivePermissionsDiffLayered(['sales.sell'], [{ permission: 'customer.request', effect: 'grant' }], []);
    expect(d.effective).toContain('customer.request');
    expect(d.userAdded).toEqual([]);
  });

  it('non-delegable role/user overrides are ignored at both layers', () => {
    const d = effectivePermissionsDiffLayered(
      ['sales.sell'],
      [{ permission: 'accounting.post', effect: 'grant' }],
      [{ permission: 'platform.manage', effect: 'grant' }],
    );
    expect(d.effective).not.toContain('accounting.post');
    expect(d.effective).not.toContain('platform.manage');
    expect(d.roleAdded).toEqual([]);
    expect(d.userAdded).toEqual([]);
  });
});

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

describe('user access overrides — UI grouping', () => {
  it('groups the operational seed into named groups (no flat list)', () => {
    const groups = groupOperationalPermissions(DELEGABLE_OPERATIONAL_PERMISSIONS);
    const keys = groups.map((g) => g.key);
    expect(keys).toEqual(['requests', 'sales', 'collections', 'operations']);
    const requests = groups.find((g) => g.key === 'requests')!;
    expect(requests.permissions).toEqual(['customer.request', 'stock_request.create', 'day.reopen.request']);
    // every operational permission is assigned to exactly one group
    expect(groups.flatMap((g) => g.permissions).sort()).toEqual([...DELEGABLE_OPERATIONAL_PERMISSIONS].sort());
  });

  it('unmapped permissions fall into an "other" group', () => {
    const groups = groupOperationalPermissions(['customer.request', 'some.future.op']);
    expect(groups.map((g) => g.key)).toEqual(['requests', 'other']);
    expect(groups.find((g) => g.key === 'other')!.permissions).toEqual(['some.future.op']);
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
