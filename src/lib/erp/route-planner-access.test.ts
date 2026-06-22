import { describe, it, expect } from 'vitest';
import { missionPermsRestrictive } from './route-planner-access';
import {
  mapRoutePlannerAccess,
  rpHasFeature,
  rpIsManagerial,
  resolveMissionPerms,
  missionPermsOf,
  RP_ROLE_DEFAULT_FEATURES,
  RP_ROLE_DEFAULT_SCOPE,
  type RoutePlannerAccessRow,
} from './route-planner-access';

const row = (over: Partial<RoutePlannerAccessRow> = {}): RoutePlannerAccessRow => ({
  role: 'field_user',
  features: ['field_missions'],
  scope_level: 'self',
  region_id: null,
  area_id: null,
  supervisor_id: null,
  team_id: null,
  ...over,
});

describe('route-planner-access', () => {
  it('returns null (unrestricted) when there is no row', () => {
    expect(mapRoutePlannerAccess(null)).toBeNull();
    expect(mapRoutePlannerAccess(undefined)).toBeNull();
  });

  it('is default-permissive: null access holds every feature', () => {
    expect(rpHasFeature(null, 'field_missions')).toBe(true);
    expect(rpHasFeature(null, 'reports')).toBe(true);
    expect(rpIsManagerial(null)).toBe(true);
  });

  it('maps a field user limited to Field Missions only', () => {
    const a = mapRoutePlannerAccess(row())!;
    expect(a.role).toBe('field_user');
    expect(a.features).toEqual(['field_missions']);
    expect(a.scopeLevel).toBe('self');
    expect(rpHasFeature(a, 'field_missions')).toBe(true);
    expect(rpHasFeature(a, 'route_planning')).toBe(false);
    expect(rpHasFeature(a, 'day_planner')).toBe(false);
    expect(rpIsManagerial(a)).toBe(false);
  });

  it('falls back to role defaults when features are empty', () => {
    const a = mapRoutePlannerAccess(row({ role: 'supervisor', features: [] }))!;
    expect(a.features).toEqual(RP_ROLE_DEFAULT_FEATURES.supervisor);
    expect(rpHasFeature(a, 'field_missions')).toBe(true);
    expect(rpHasFeature(a, 'route_planning')).toBe(false);
  });

  it('falls back to role default scope when scope_level is invalid', () => {
    const a = mapRoutePlannerAccess(row({ role: 'area_manager', scope_level: 'bogus' }))!;
    expect(a.scopeLevel).toBe(RP_ROLE_DEFAULT_SCOPE.area_manager);
    expect(a.scopeLevel).toBe('area');
  });

  it('drops unknown feature strings, coerces unknown role to field_user', () => {
    const a = mapRoutePlannerAccess(row({ role: 'wizard', features: ['field_missions', 'teleport'] }))!;
    expect(a.role).toBe('field_user');
    expect(a.features).toEqual(['field_missions']);
  });

  it('treats route_planner_admin and manager as managerial', () => {
    expect(rpIsManagerial(mapRoutePlannerAccess(row({ role: 'route_planner_admin', features: [] })))).toBe(true);
    expect(rpIsManagerial(mapRoutePlannerAccess(row({ role: 'manager', features: [] })))).toBe(true);
    expect(rpIsManagerial(mapRoutePlannerAccess(row({ role: 'supervisor', features: [] })))).toBe(false);
  });

  it('preserves scope target ids', () => {
    const a = mapRoutePlannerAccess(row({ role: 'area_manager', scope_level: 'area', area_id: 'area-1', region_id: 'reg-1' }))!;
    expect(a.areaId).toBe('area-1');
    expect(a.regionId).toBe('reg-1');
    expect(a.isDefault).toBe(false);
  });
});

describe('mission permissions (thin admin slice)', () => {
  it('role defaults: managers author+assign+review, field roles execute-only', () => {
    expect(resolveMissionPerms('manager')).toEqual({ canCreate: true, canAssign: true, canExecute: true, canReview: true });
    expect(resolveMissionPerms('area_manager')).toEqual({ canCreate: true, canAssign: true, canExecute: true, canReview: true });
    expect(resolveMissionPerms('supervisor')).toEqual({ canCreate: false, canAssign: false, canExecute: true, canReview: false });
    expect(resolveMissionPerms('field_user')).toEqual({ canCreate: false, canAssign: false, canExecute: true, canReview: false });
  });

  it('a per-user override wins over the role default (in both directions)', () => {
    // promote a supervisor to create + review
    expect(resolveMissionPerms('supervisor', { create: true, review: true })).toMatchObject({ canCreate: true, canReview: true, canExecute: true });
    // restrict a manager from assigning
    expect(resolveMissionPerms('manager', { assign: false })).toMatchObject({ canCreate: true, canAssign: false });
  });

  it('mapRoutePlannerAccess resolves missionPerms from the row override', () => {
    const a = mapRoutePlannerAccess(row({ role: 'supervisor', mission_perms: { create: true } }))!;
    expect(a.missionPerms).toEqual({ canCreate: true, canAssign: false, canExecute: true, canReview: false });
  });

  it('missionPermsOf is default-permissive for null access', () => {
    expect(missionPermsOf(null)).toEqual({ canCreate: true, canAssign: true, canExecute: true, canReview: true });
    expect(missionPermsOf(mapRoutePlannerAccess(row({ role: 'field_user' })))).toMatchObject({ canCreate: false, canExecute: true });
  });
});

describe('missionPermsRestrictive — default-restrictive WRITE posture (pilot)', () => {
  it('1) company admin with NO access row → full capability', () => {
    expect(missionPermsRestrictive(null, true)).toEqual({ canCreate: true, canAssign: true, canExecute: true, canReview: true });
  });
  it('2) explicit access row → its role default (supervisor = execute-only; manager = full)', () => {
    expect(missionPermsRestrictive(mapRoutePlannerAccess(row({ role: 'supervisor' })), false))
      .toMatchObject({ canCreate: false, canAssign: false, canExecute: true, canReview: false });
    expect(missionPermsRestrictive(mapRoutePlannerAccess(row({ role: 'manager' })), false))
      .toMatchObject({ canCreate: true, canAssign: true, canReview: true });
  });
  it('2b) explicit per-user override wins over the role default', () => {
    const access = mapRoutePlannerAccess(row({ role: 'supervisor', mission_perms: { create: true } }));
    expect(missionPermsRestrictive(access, false)).toMatchObject({ canCreate: true, canExecute: true });
  });
  it('3) normal user with NO access row → DENIED everything (admin gate, RLS backstop)', () => {
    expect(missionPermsRestrictive(null, false)).toEqual({ canCreate: false, canAssign: false, canExecute: false, canReview: false });
  });
});
