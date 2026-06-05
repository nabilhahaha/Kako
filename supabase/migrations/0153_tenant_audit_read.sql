-- ============================================================================
-- 0153: Tenant Audit Viewer — company admins read their OWN company's audit log
-- ----------------------------------------------------------------------------
-- erp_audit_logs SELECT was vendor-only (platform owner / super-admin / staff with
-- access_audit_logs). Company admins had no way to audit actions within their own
-- company. This adds an additive SELECT policy scoped to the caller's own company
-- AND requiring company-admin (erp_is_company_admin). Rows with NULL company_id
-- (platform-level events) remain vendor-only. Read-only, own-company-only — does
-- not weaken tenant isolation. Reversible.
-- ============================================================================

CREATE POLICY erp_audit_logs_company_admin_read ON erp_audit_logs
  FOR SELECT
  USING (company_id IS NOT NULL AND erp_is_company_admin(company_id));

-- Rollback: DROP POLICY erp_audit_logs_company_admin_read ON erp_audit_logs;
