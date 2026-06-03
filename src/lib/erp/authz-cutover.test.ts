import { describe, it, expect } from 'vitest';
import {
  MIGRATED_CALL_SITES,
  CAPABILITY_ALIASES,
  GRANULAR_CAPABILITIES,
  expandAliases,
  can,
} from './capabilities';
import {
  ROLE_PERMISSIONS,
  permissionsForRole,
  hasPermission,
  type Permission,
} from './permissions';
import type { BranchRole } from './types';

// ─── Authorization Phase 2 — cutover safety ───────────────────────────────────
//
// PRIME DIRECTIVE: no role may lose access when a coarse flat check is swapped
// for its most-specific alias-covered granular capability. These tests prove the
// migrated call sites preserve exactly the prior allow/deny boundary for every
// role in ROLE_PERMISSIONS — both directions: anyone who COULD pass the old
// check still passes the new one, and no orphan/deny-all granular key was wired.

const ALL_ROLES = Object.keys(ROLE_PERMISSIONS) as BranchRole[];

/** Build a non-super-admin context from a role's resolved flat permissions. */
function roleCtx(role: BranchRole) {
  return { isSuperAdmin: false, permissions: permissionsForRole(role) as string[] };
}

describe('authz P2 cutover — migrated call-site registry integrity', () => {
  it('every migrated granular key is a real member of the granular catalog', () => {
    const catalog = new Set<string>(GRANULAR_CAPABILITIES);
    for (const m of MIGRATED_CALL_SITES) {
      expect(catalog.has(m.granular), `${m.site}: ${m.granular} must be a known granular capability`).toBe(true);
    }
  });

  it('every migrated granular key is alias-REACHABLE from its declared legacy key', () => {
    // The legacy key the site used to check must alias-expand to the granular key
    // we now check — this is what guarantees behavioral equivalence.
    for (const m of MIGRATED_CALL_SITES) {
      const reachable = expandAliases([m.legacy]);
      expect(
        reachable.has(m.granular),
        `${m.site}: legacy '${m.legacy}' must alias-expand to '${m.granular}'`,
      ).toBe(true);
    }
  });

  it('no orphan/deny-all key was introduced — every migrated key is alias-reachable from ≥1 current role', () => {
    // For each granular key now required at a site, at least one role in the
    // system must be able to reach it via its flat perms. Otherwise we silently
    // created a capability nobody can hold (a cutover regression / deny-all).
    for (const m of MIGRATED_CALL_SITES) {
      const someRoleHasIt = ALL_ROLES.some((role) => can(roleCtx(role), m.granular));
      expect(someRoleHasIt, `${m.site}: granular '${m.granular}' is unreachable by every role (orphan/deny-all)`).toBe(true);
    }
  });
});

describe('authz P2 cutover — no role loses access at any migrated site', () => {
  it('every role that could satisfy the OLD flat check still satisfies the NEW granular check', () => {
    for (const m of MIGRATED_CALL_SITES) {
      for (const role of ALL_ROLES) {
        const ctx = roleCtx(role);
        const couldBefore = hasPermission(
          { isSuperAdmin: false, permissions: permissionsForRole(role) },
          m.legacy as Permission,
        );
        if (!couldBefore) continue; // role never had access here → not our concern
        expect(
          can(ctx, m.granular),
          `REGRESSION at ${m.site}: role '${role}' had '${m.legacy}' but lost '${m.granular}'`,
        ).toBe(true);
      }
    }
  });

  it('the new granular check is no BROADER than the old flat check (no role newly gains access)', () => {
    // Cutover safety is bidirectional: a role that could NOT pass the old check
    // must not pass the new one either (the alias must not over-grant this key).
    for (const m of MIGRATED_CALL_SITES) {
      for (const role of ALL_ROLES) {
        const couldBefore = hasPermission(
          { isSuperAdmin: false, permissions: permissionsForRole(role) },
          m.legacy as Permission,
        );
        const canAfter = can(roleCtx(role), m.granular);
        expect(
          canAfter,
          `WIDENED at ${m.site}: role '${role}' newly gains '${m.granular}' it could not reach via '${m.legacy}'`,
        ).toBe(couldBefore);
      }
    }
  });
});

describe('authz P2 cutover — privileged roles unaffected', () => {
  it('admin and manager (ALL permissions) satisfy every migrated granular capability', () => {
    for (const role of ['admin', 'manager'] as BranchRole[]) {
      const ctx = roleCtx(role);
      for (const m of MIGRATED_CALL_SITES) {
        expect(can(ctx, m.granular), `${role} must satisfy ${m.granular} (${m.site})`).toBe(true);
      }
    }
  });

  it('super admin satisfies every migrated granular capability', () => {
    const ctx = { isSuperAdmin: true, permissions: [] as string[] };
    for (const m of MIGRATED_CALL_SITES) {
      expect(can(ctx, m.granular), `super admin must satisfy ${m.granular} (${m.site})`).toBe(true);
    }
  });
});

describe('authz P2 cutover — reserved net-new capabilities stay deny-all (not wired)', () => {
  // These finer capabilities are intentionally NOT produced by any alias and must
  // NOT have been migrated into a call site — doing so would deny every role.
  const RESERVED_NET_NEW = [
    'sales.order.cancel', 'sales.invoice.cancel', 'sales.payment.writeoff',
    'sales.price.override', 'customers.delete', 'inventory.adjustment.approve',
    'purchasing.po.approve', 'accounting.voucher.approve',
  ] as const;

  it('no alias produces any reserved net-new capability', () => {
    const allAliasTargets = new Set(Object.values(CAPABILITY_ALIASES).flat());
    for (const k of RESERVED_NET_NEW) {
      expect(allAliasTargets.has(k as never), `${k} must remain unaliased (reserved for later phases)`).toBe(false);
    }
  });

  it('no reserved net-new capability was wired into a migrated call site', () => {
    const migrated = new Set(MIGRATED_CALL_SITES.map((m) => m.granular));
    for (const k of RESERVED_NET_NEW) {
      expect(migrated.has(k as never), `${k} must not be used at a migrated call site (deny-all regression)`).toBe(false);
    }
  });

  it('every role is denied each reserved net-new capability (proves they are deny-all today)', () => {
    for (const role of ALL_ROLES) {
      if (ROLE_PERMISSIONS[role] === '*') continue; // admin/manager hold everything
      const ctx = roleCtx(role);
      for (const k of RESERVED_NET_NEW) {
        expect(can(ctx, k), `${role} must NOT hold reserved '${k}'`).toBe(false);
      }
    }
  });
});
