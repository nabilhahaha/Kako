import { describe, it, expect } from 'vitest';
import { missionPermsRestrictive, mapRoutePlannerAccess } from '@/lib/erp/route-planner-access';

/**
 * D1b — mission WRITE gating. The server actions (createMission / assignMission /
 * transitionMissionStatus) gate on exactly `missionPermsRestrictive(ctx.routePlannerAccess,
 * isCompanyAdmin)`, where isCompanyAdmin = platform owner || super admin || topRole==='admin'.
 * These tests pin that decision table. (Cross-company writes are additionally blocked by the
 * `.eq('company_id', ctx.companyId)` scope + the erp_rp_missions RLS — exercised by the CI
 * integration-DB job, not unit-testable here.)
 */
const row = (over: Record<string, unknown> = {}) => ({
  role: 'manager', features: null, scope_level: null, region_id: null, area_id: null,
  supervisor_id: null, team_id: null, mission_perms: null, ...over,
});

describe('D1b mission-write gating (default-restrictive)', () => {
  it('1) Company Admin (no access row) → may create / assign / review', () => {
    const p = missionPermsRestrictive(null, true);
    expect(p.canCreate && p.canAssign && p.canReview && p.canExecute).toBe(true);
  });

  it('2) Explicit access row → only its allowed actions', () => {
    const manager = missionPermsRestrictive(mapRoutePlannerAccess(row({ role: 'manager' })), false);
    expect(manager).toMatchObject({ canCreate: true, canAssign: true, canReview: true });

    const supervisor = missionPermsRestrictive(mapRoutePlannerAccess(row({ role: 'supervisor' })), false);
    expect(supervisor).toMatchObject({ canCreate: false, canAssign: false, canExecute: true, canReview: false });

    const field = missionPermsRestrictive(mapRoutePlannerAccess(row({ role: 'field_user' })), false);
    expect(field.canCreate).toBe(false);
    expect(field.canAssign).toBe(false);

    // per-user override is honoured
    const supCanCreate = missionPermsRestrictive(mapRoutePlannerAccess(row({ role: 'supervisor', mission_perms: { create: true } })), false);
    expect(supCanCreate.canCreate).toBe(true);
  });

  it('3) Normal user (no access row, not admin) → DENIED every write', () => {
    const p = missionPermsRestrictive(null, false);
    expect(p.canCreate || p.canAssign || p.canExecute || p.canReview).toBe(false);
  });
});
