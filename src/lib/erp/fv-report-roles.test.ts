import { describe, it, expect } from 'vitest';
import { permissionsForRole } from './permissions';

// The strict FV report-visibility model (migration 0374) is enforced by RLS, but the role →
// permission mapping that drives it lives here. Lock the intended grants:
//   - field_verification.reports      : who may OPEN reports (supervisor/viewer/manager/admin)
//   - field_verification.reports_all  : who reads COMPANY-WIDE rows (viewer/manager/admin) —
//     NOT supervisor (supervisor is org-team-scoped via erp_subordinate_ids in RLS).
describe('FV report role mapping', () => {
  const has = (role: 'admin' | 'manager' | 'supervisor' | 'viewer' | 'salesman', perm: string) =>
    permissionsForRole(role).includes(perm as never);

  it('admin & manager hold both reports and company-wide reports_all', () => {
    for (const r of ['admin', 'manager'] as const) {
      expect(has(r, 'field_verification.reports')).toBe(true);
      expect(has(r, 'field_verification.reports_all')).toBe(true);
    }
  });

  it('viewer holds reports + company-wide reports_all (read-only company reporting)', () => {
    expect(has('viewer', 'field_verification.reports')).toBe(true);
    expect(has('viewer', 'field_verification.reports_all')).toBe(true);
  });

  it('supervisor may open reports but is NOT company-wide (team-scoped via RLS)', () => {
    expect(has('supervisor', 'field_verification.reports')).toBe(true);
    expect(has('supervisor', 'field_verification.reports_all')).toBe(false);
  });

  it('a field rep (salesman) holds neither report permission → own rows only', () => {
    expect(has('salesman', 'field_verification.reports')).toBe(false);
    expect(has('salesman', 'field_verification.reports_all')).toBe(false);
    expect(has('salesman', 'field_verification.verify')).toBe(true);
  });
});
