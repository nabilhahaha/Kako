import { describe, it, expect } from 'vitest';
import { rpCanDecideRequests } from '@/lib/erp/route-planner-access';

/**
 * D2 — request decide gate (default-restrictive). submitRequest is open to any company
 * member (RLS: requested_by = self). decideRequest gates on rpCanDecideRequests(role, admin)
 * AND blocks self-approval (requester !== approver, enforced in the action). Cross-company
 * decisions are blocked by the .eq('company_id') scope + erp_route_planner_requests RLS
 * (CI integration-DB job).
 */
describe('D2 request-decide gating (default-restrictive)', () => {
  it('Company Admin (no access row) → may decide', () => {
    expect(rpCanDecideRequests(null, true)).toBe(true);
  });
  it('Managerial RP roles → may decide', () => {
    expect(rpCanDecideRequests('manager', false)).toBe(true);
    expect(rpCanDecideRequests('area_manager', false)).toBe(true);
    expect(rpCanDecideRequests('route_planner_admin', false)).toBe(true);
  });
  it('Supervisor / field_user / no role → DENIED', () => {
    expect(rpCanDecideRequests('supervisor', false)).toBe(false);
    expect(rpCanDecideRequests('field_user', false)).toBe(false);
    expect(rpCanDecideRequests(null, false)).toBe(false);
  });
});
