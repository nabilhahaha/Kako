import { describe, it, expect } from 'vitest';
import {
  GRANULAR_CAPABILITIES,
  CAPABILITY_ALIASES,
  ALIASED_LEGACY_KEYS,
  expandAliases,
  can,
  canAny,
  isGranularCapability,
} from './capabilities';
import { ALL_PERMISSIONS, ROLE_PERMISSIONS, permissionsForRole } from './permissions';
import type { BranchRole } from './types';

const ALL_ROLES = Object.keys(ROLE_PERMISSIONS) as BranchRole[];

describe('granular capability catalog integrity', () => {
  it('has no duplicate capability keys', () => {
    expect(new Set(GRANULAR_CAPABILITIES).size).toBe(GRANULAR_CAPABILITIES.length);
  });

  it('every alias TARGET is a member of the granular catalog (no typos/orphans)', () => {
    for (const [legacy, targets] of Object.entries(CAPABILITY_ALIASES)) {
      for (const t of targets) {
        expect(isGranularCapability(t), `${legacy} → ${t} must be a known granular capability`).toBe(true);
      }
    }
  });

  it('every alias KEY is a real flat permission', () => {
    for (const key of ALIASED_LEGACY_KEYS) {
      expect(ALL_PERMISSIONS, `alias key ${key} must be a real Permission`).toContain(key);
    }
  });

  it('aliases never collapse to fewer targets than declared (each expands to ≥1)', () => {
    for (const targets of Object.values(CAPABILITY_ALIASES)) {
      expect(targets.length).toBeGreaterThan(0);
    }
  });
});

describe('expandAliases — superset / backward compatibility', () => {
  it('always preserves the original keys (superset property)', () => {
    const sample = ['sales.sell', 'inventory.view', 'reports.view', 'field.sales'] as const;
    const eff = expandAliases(sample);
    for (const p of sample) expect(eff.has(p)).toBe(true);
  });

  it('expands a flat key to its documented granular set', () => {
    const eff = expandAliases(['sales.sell']);
    for (const g of ['sales.order.create', 'sales.invoice.create', 'sales.invoice.edit_draft']) {
      expect(eff.has(g)).toBe(true);
    }
  });

  it('passes through keys with no alias unchanged', () => {
    const eff = expandAliases(['field.sales', 'hotel.manage']);
    expect(eff.has('field.sales')).toBe(true);
    expect(eff.has('hotel.manage')).toBe(true);
    expect(eff.size).toBe(2);
  });

  it('returns a de-duplicated set', () => {
    const eff = expandAliases(['sales.sell', 'sales.sell', 'inventory.view']);
    expect(eff.has('sales.invoice.create')).toBe(true);
    // 'inventory.view' itself + its 2 aliases + 'sales.sell' + its 6 aliases, deduped
    expect(eff.size).toBeGreaterThan(0);
  });
});

describe('CUTOVER INVARIANT — no role gains or loses access (AUTHORIZATION-MODEL.md §15)', () => {
  it('for every role, every legacy permission it holds today still resolves via can()', () => {
    for (const role of ALL_ROLES) {
      const perms = permissionsForRole(role);
      const ctx = { isSuperAdmin: false, permissions: perms };
      for (const p of perms) {
        expect(can(ctx, p), `${role} must retain ${p}`).toBe(true);
      }
    }
  });

  it('expandAliases(role perms) ⊇ role perms for every role', () => {
    for (const role of ALL_ROLES) {
      const perms = permissionsForRole(role);
      const eff = expandAliases(perms);
      for (const p of perms) expect(eff.has(p)).toBe(true);
    }
  });
});

describe('granular resolution from current roles', () => {
  it('salesman (sales.sell) resolves invoice/order create but not return.approve', () => {
    const ctx = { isSuperAdmin: false, permissions: permissionsForRole('salesman') };
    expect(can(ctx, 'sales.invoice.create')).toBe(true);
    expect(can(ctx, 'sales.order.create')).toBe(true);
    expect(can(ctx, 'sales.payment.collect')).toBe(true); // has sales.collect
    expect(can(ctx, 'sales.return.approve')).toBe(false); // lacks sales.return
  });

  it('branch_manager (sales.return) resolves sales.return.approve', () => {
    const ctx = { isSuperAdmin: false, permissions: permissionsForRole('branch_manager') };
    expect(can(ctx, 'sales.return.approve')).toBe(true);
    expect(can(ctx, 'inventory.stock.adjust')).toBe(true); // has inventory.adjust
  });

  it('accountant (accounting.post) resolves the journal posting capability', () => {
    const ctx = { isSuperAdmin: false, permissions: permissionsForRole('accountant') };
    expect(can(ctx, 'accounting.journal.post')).toBe(true);
    expect(can(ctx, 'accounting.journal.view')).toBe(true);
  });

  it('super admin holds every granular capability', () => {
    const ctx = { isSuperAdmin: true, permissions: [] as string[] };
    for (const g of GRANULAR_CAPABILITIES) expect(can(ctx, g)).toBe(true);
  });

  it('the platform owner (vendor apex tier) holds every granular capability', () => {
    const ctx = { isSuperAdmin: false, isPlatformOwner: true, permissions: [] as string[] };
    for (const g of GRANULAR_CAPABILITIES) expect(can(ctx, g)).toBe(true);
    expect(canAny(ctx, ['fashion.sell'])).toBe(true);
  });
});

describe('export transition rule', () => {
  it('integrations.manage grants every per-module export (no data newly hidden)', () => {
    const ctx = { isSuperAdmin: false, permissions: ['integrations.manage'] as string[] };
    for (const e of ['sales.export', 'inventory.export', 'accounting.export', 'reports.export']) {
      expect(can(ctx, e)).toBe(true);
    }
  });

  it('a role without integrations.manage has no export capability by default', () => {
    const ctx = { isSuperAdmin: false, permissions: permissionsForRole('salesman') };
    expect(can(ctx, 'sales.export')).toBe(false);
  });
});

describe('net-new granular capabilities are reserved, not silently granted', () => {
  const NET_NEW = [
    'sales.order.cancel', 'sales.invoice.cancel', 'sales.payment.writeoff', 'sales.price.override',
    'customers.delete', 'inventory.adjustment.approve', 'purchasing.po.approve', 'accounting.voucher.approve',
  ];
  it('exist in the catalog', () => {
    for (const c of NET_NEW) expect(isGranularCapability(c)).toBe(true);
  });
  it('are NOT produced by expanding the full legacy permission set', () => {
    const eff = expandAliases(ALL_PERMISSIONS);
    for (const c of NET_NEW) {
      expect(eff.has(c), `${c} must require explicit assignment, not an alias`).toBe(false);
    }
  });
});

describe('canAny', () => {
  it('passes when any capability resolves', () => {
    const ctx = { isSuperAdmin: false, permissions: permissionsForRole('salesman') };
    expect(canAny(ctx, ['sales.return.approve', 'sales.invoice.create'])).toBe(true);
    expect(canAny(ctx, ['sales.return.approve', 'accounting.journal.post'])).toBe(false);
  });
});
