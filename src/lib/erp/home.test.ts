import { describe, it, expect } from 'vitest';
import { resolveHomePath } from './home';
import type { Module } from './navigation';
import type { Permission } from './permissions';

// Shorthand helpers
function path(
  modules: Module[],
  permissions: Permission[],
  isPlatformOwner?: boolean,
): string {
  return resolveHomePath({ modules, permissions, isPlatformOwner });
}

describe('resolveHomePath', () => {
  // ─── Platform owner ─────────────────────────────────────────────────────

  it('routes the platform owner to /platform regardless of modules', () => {
    expect(path(['sales', 'inventory'], [], true)).toBe('/platform');
  });

  it('routes the platform owner to /platform even with no modules', () => {
    expect(path([], [], true)).toBe('/platform');
  });

  // ─── Platform staff / no-company users (redirect-loop guard) ──────────────

  it('routes a no-company user (platform staff) to /dashboard, never a vertical', () => {
    // Platform staff hold ALL_MODULES by default but belong to no company; without
    // the companyId===null guard they would route to /fashion and bounce off its
    // permission guard back to /dashboard in an infinite loop.
    expect(
      resolveHomePath({ companyId: null, modules: ['fashion', 'clinic', 'hotel'], permissions: [] }),
    ).toBe('/dashboard');
  });

  // ─── Clinic module ───────────────────────────────────────────────────────

  it('routes a clinic manager (clinic.manage) to /clinic', () => {
    expect(path(['clinic'], ['clinic.manage'])).toBe('/clinic');
  });

  it('routes a clinic doctor (clinic.doctor) to /clinic/doctor', () => {
    expect(path(['clinic'], ['clinic.doctor'])).toBe('/clinic/doctor');
  });

  it('routes a clinic receptionist (clinic.reception) to /clinic/reception', () => {
    expect(path(['clinic'], ['clinic.reception'])).toBe('/clinic/reception');
  });

  it('falls back to /clinic for a clinic user with no specific role permission', () => {
    // Has clinic module but none of the three specific perms
    expect(path(['clinic'], [])).toBe('/clinic');
  });

  // clinic.manage takes priority over clinic.doctor / clinic.reception
  it('prefers /clinic over /clinic/doctor when user has both manage + doctor perms', () => {
    expect(path(['clinic'], ['clinic.manage', 'clinic.doctor'])).toBe('/clinic');
  });

  // ─── Fashion Store (clothing) ─────────────────────────────────────────────

  it('routes the fashion module to /fashion (the store home, not the generic dashboard)', () => {
    expect(path(['fashion'], ['fashion.manage'])).toBe('/fashion');
  });

  it('routes a clothing user to /fashion even with no other modules', () => {
    expect(path(['fashion'], [])).toBe('/fashion');
  });

  // ─── Other verticals ─────────────────────────────────────────────────────

  it('routes restaurant module to /restaurant', () => {
    expect(path(['restaurant'], [])).toBe('/restaurant');
  });

  it('routes salon module to /salon', () => {
    expect(path(['salon'], [])).toBe('/salon');
  });

  it('routes laundry module to /laundry', () => {
    expect(path(['laundry'], [])).toBe('/laundry');
  });

  it('routes pharmacy module to /pharmacy/dispense', () => {
    expect(path(['pharmacy'], [])).toBe('/pharmacy/dispense');
  });

  it('routes hotel module to /hotel/bookings', () => {
    expect(path(['hotel'], [])).toBe('/hotel/bookings');
  });

  it('routes wholesale module to /wholesale', () => {
    expect(path(['wholesale'], [])).toBe('/wholesale');
  });

  // ─── General / retail ────────────────────────────────────────────────────

  it('falls back to /dashboard for general retail (sales + inventory)', () => {
    expect(path(['sales', 'inventory'], [])).toBe('/dashboard');
  });

  it('falls back to /dashboard for a user with no modules', () => {
    expect(path([], [])).toBe('/dashboard');
  });

  it('falls back to /dashboard for modules not matched by any vertical shortcut', () => {
    expect(path(['accounting', 'purchasing'], [])).toBe('/dashboard');
  });

  // ─── Clinic takes priority over other modules ─────────────────────────────

  it('routes to /clinic even when other modules are also present', () => {
    expect(path(['sales', 'clinic', 'inventory'], ['clinic.doctor'])).toBe('/clinic/doctor');
  });

  // ─── U1: role-aware landing for FMCG roles (memberships present) ───────────
  const byRole = (role: string) =>
    resolveHomePath({ companyId: 'c1', modules: ['sales', 'inventory', 'distribution'] as Module[], permissions: [], memberships: [{ role: role as never }] });

  it('lands each FMCG role on its work screen', () => {
    expect(byRole('salesman')).toBe('/today');
    expect(byRole('driver')).toBe('/today');
    expect(byRole('supervisor')).toBe('/approvals/queue');
    expect(byRole('accountant')).toBe('/collections');
    expect(byRole('warehouse_keeper')).toBe('/inventory/requests');
    expect(byRole('branch_manager')).toBe('/manager');
    expect(byRole('admin')).toBe('/dashboard');
    expect(byRole('manager')).toBe('/dashboard');
  });

  it('falls back to /dashboard when no memberships are supplied', () => {
    expect(path(['sales', 'inventory'], [])).toBe('/dashboard');
  });

  it('most-senior role wins for a multi-role user', () => {
    expect(resolveHomePath({ companyId: 'c1', modules: ['sales'] as Module[], permissions: [], memberships: [{ role: 'salesman' as never }, { role: 'admin' as never }] })).toBe('/dashboard');
  });
});
