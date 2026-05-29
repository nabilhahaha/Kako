-- ============================================================================
-- 0024: ERP audit log
-- ----------------------------------------------------------------------------
-- Records sensitive changes (permissions, users, companies, subscriptions).
-- Rows are written only through erp_log_audit() (SECURITY DEFINER) so the
-- actor cannot be forged. Visible to the platform owner / global super admins.
-- Additive, safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID,
  actor_email TEXT,
  company_id  UUID REFERENCES erp_companies(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_audit_logs_created ON erp_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_erp_audit_logs_company ON erp_audit_logs(company_id);

ALTER TABLE erp_audit_logs ENABLE ROW LEVEL SECURITY;

-- Read: platform owner + global super admins. No direct INSERT/UPDATE/DELETE
-- policy → rows are only written via erp_log_audit() below.
DROP POLICY IF EXISTS "erp_audit_logs_read" ON erp_audit_logs;
CREATE POLICY "erp_audit_logs_read" ON erp_audit_logs FOR SELECT
  USING (erp_is_platform_owner() OR erp_is_super_admin());

CREATE OR REPLACE FUNCTION erp_log_audit(
  p_action     TEXT,
  p_entity     TEXT,
  p_entity_id  TEXT DEFAULT NULL,
  p_details    JSONB DEFAULT NULL,
  p_company_id UUID DEFAULT NULL
) RETURNS void AS $$
  INSERT INTO erp_audit_logs (actor_id, actor_email, company_id, action, entity, entity_id, details)
  SELECT auth.uid(),
         (SELECT email FROM erp_profiles WHERE id = auth.uid()),
         p_company_id, p_action, p_entity, p_entity_id, p_details;
$$ LANGUAGE sql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION erp_log_audit(TEXT, TEXT, TEXT, JSONB, UUID) TO authenticated;
