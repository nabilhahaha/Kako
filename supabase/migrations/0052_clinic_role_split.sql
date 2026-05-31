-- ============================================================================
-- 0052: Split clinic access into reception vs doctor
-- ----------------------------------------------------------------------------
-- Replaces the single broad 'clinic.manage' for the doctor / receptionist
-- roles with scoped permissions:
--   * receptionist → clinic.reception (appointments, registration, billing)
--   * doctor       → clinic.doctor    (queue, exam, prescriptions, file)
-- admin/manager keep clinic.manage (full). Applies to the global role defaults
-- AND backfills existing clinic tenants' per-company role permissions. Safe to
-- re-run.
-- ============================================================================

-- 1) Global role defaults
INSERT INTO erp_role_permissions (role_key, permission) VALUES
  ('receptionist', 'clinic.reception'),
  ('doctor', 'clinic.doctor')
ON CONFLICT DO NOTHING;

DELETE FROM erp_role_permissions
 WHERE role_key IN ('doctor', 'receptionist') AND permission = 'clinic.manage';

-- 2) Existing clinic companies: per-company role permissions
INSERT INTO erp_company_role_permissions (company_id, role_key, permission)
SELECT cr.company_id, cr.role_key,
       CASE cr.role_key WHEN 'receptionist' THEN 'clinic.reception'
                        WHEN 'doctor'       THEN 'clinic.doctor' END
FROM erp_company_roles cr
JOIN erp_companies c ON c.id = cr.company_id
WHERE c.business_type = 'clinic'
  AND cr.enabled
  AND cr.role_key IN ('receptionist', 'doctor')
ON CONFLICT DO NOTHING;

DELETE FROM erp_company_role_permissions crp
USING erp_companies c
WHERE crp.company_id = c.id
  AND c.business_type = 'clinic'
  AND crp.role_key IN ('doctor', 'receptionist')
  AND crp.permission = 'clinic.manage';
