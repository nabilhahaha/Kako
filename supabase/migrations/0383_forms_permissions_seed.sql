-- ============================================================================
-- 0383: Multi-Form Field Work — seed the forms.* permissions (ADDITIVE).
--
-- Grants the new custom-form permissions to the standard roles, mirroring the existing
-- field_verification.* grants (0370):
--   forms.admin   → admin, manager        (build / publish / assign / activate)
--   forms.fill    → admin, manager, salesman (My Forms)
--   forms.reports → admin, manager, supervisor, viewer (form reports/dashboards)
--   forms.export  → admin, manager        (export form data)
--
-- 1) Global defaults (erp_role_permissions) — used by erp_seed_company_roles() for NEW
--    companies.
-- 2) Backfill EXISTING companies (erp_company_role_permissions): grant each forms.* perm to
--    any company role that already holds the matching field_verification.* analogue, so
--    existing FV companies gain the forms.* perms without changing anything else.
--
-- INSERT ... ON CONFLICT DO NOTHING only — purely additive, no UPDATE/DELETE, no data change,
-- no Field Verification behaviour change. Safe to re-run.
-- ============================================================================

INSERT INTO erp_role_permissions (role_key, permission) VALUES
  ('admin', 'forms.admin'), ('admin', 'forms.fill'), ('admin', 'forms.reports'), ('admin', 'forms.export'),
  ('manager', 'forms.admin'), ('manager', 'forms.fill'), ('manager', 'forms.reports'), ('manager', 'forms.export'),
  ('supervisor', 'forms.reports'),
  ('salesman', 'forms.fill'),
  ('viewer', 'forms.reports')
ON CONFLICT (role_key, permission) DO NOTHING;

-- Backfill existing companies: where a company role already holds a field_verification.*
-- permission, grant the corresponding forms.* permission. Additive; never removes anything.
INSERT INTO erp_company_role_permissions (company_id, role_key, permission)
SELECT crp.company_id, crp.role_key, m.forms_perm
FROM erp_company_role_permissions crp
JOIN (VALUES
  ('field_verification.admin',   'forms.admin'),
  ('field_verification.verify',  'forms.fill'),
  ('field_verification.reports', 'forms.reports'),
  ('field_verification.export',  'forms.export')
) AS m(fv_perm, forms_perm) ON crp.permission = m.fv_perm
ON CONFLICT (company_id, role_key, permission) DO NOTHING;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DELETE FROM erp_company_role_permissions WHERE permission LIKE 'forms.%';
-- DELETE FROM erp_role_permissions WHERE permission LIKE 'forms.%';
