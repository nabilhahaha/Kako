import { describe, it, expect } from 'vitest';
import { actionAuthzAllows, actionAuthzEnforced, ACTION_AUTHZ_FLAG } from './action-authz-core';
import { permissionsForRole } from './permissions';
import type { BranchRole } from './types';

describe('action-authz core decision', () => {
  it('flag helper reads the company flag map', () => {
    expect(actionAuthzEnforced({})).toBe(false);
    expect(actionAuthzEnforced({ [ACTION_AUTHZ_FLAG]: false })).toBe(false);
    expect(actionAuthzEnforced({ [ACTION_AUTHZ_FLAG]: true })).toBe(true);
  });

  it('apex is always allowed regardless of flag/perm', () => {
    expect(actionAuthzAllows({ apex: true, enforced: true, holdsAny: false })).toBe(true);
    expect(actionAuthzAllows({ apex: true, enforced: false, holdsAny: false })).toBe(true);
  });

  it('flag OFF is a no-op (default behaviour preserved)', () => {
    expect(actionAuthzAllows({ apex: false, enforced: false, holdsAny: false })).toBe(true);
  });

  it('flag ON: allowed iff the caller holds a required permission', () => {
    expect(actionAuthzAllows({ apex: false, enforced: true, holdsAny: true })).toBe(true);
    expect(actionAuthzAllows({ apex: false, enforced: true, holdsAny: false })).toBe(false);
  });
});

// Code-level allow/deny sanity matrix for the Section-F actions, using the flat
// (non-aliased) permission each action requires. The authoritative per-tenant
// matrix is validated against the live DB in supabase/pilot (SQL), but this guards
// the intent at the code layer too. `enforced` is assumed true (flag ON).
const ACTIONS: Record<string, string[]> = {
  createTransfer: ['inventory.transfer', 'stock.transfer'],
  createStockCount: ['inventory.count'],
  createStockRequest: ['stock_request.create'],
  rejectStockRequest: ['stock_request.approve'],
  upsertProduct_create: ['product.create'],
  upsertProduct_edit: ['product.edit'],
  toggleProductActive: ['product.edit'],
  addDrugsToProducts: ['product.import'],
  upsertCustomer_create: ['customer.create'],
  importCustomers: ['customer.import'],
};

function holds(role: BranchRole, caps: string[]): boolean {
  const perms = permissionsForRole(role) as string[];
  return caps.some((c) => perms.includes(c));
}

describe('action-authz role × action sanity (code grants)', () => {
  it('viewer is denied every Section-F mutating action', () => {
    for (const caps of Object.values(ACTIONS)) {
      expect(actionAuthzAllows({ apex: false, enforced: true, holdsAny: holds('viewer', caps) })).toBe(false);
    }
  });

  it('admin (code = all) is allowed every Section-F action', () => {
    for (const caps of Object.values(ACTIONS)) {
      expect(holds('admin', caps)).toBe(true);
    }
  });

  it('salesman holds stock_request.create but not approve / product create', () => {
    // Note: the live DB grants are authoritative (and stricter than these code
    // defaults — e.g. DB salesman lacks customer.create); the per-tenant matrix is
    // validated in supabase/pilot. Here we assert the code-default intent.
    expect(holds('salesman', ACTIONS.createStockRequest)).toBe(true);
    expect(holds('salesman', ACTIONS.rejectStockRequest)).toBe(false);
    expect(holds('salesman', ACTIONS.upsertProduct_create)).toBe(false);
  });
});
