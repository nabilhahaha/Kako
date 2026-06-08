-- ============================================================================
-- 0207: E-Invoicing Compliance — compliance audit log (Phase 5F)
-- ----------------------------------------------------------------------------
-- The append-only audit trail for the compliance platform: every lifecycle
-- transition, retry/dead-letter decision, certificate status change, and (later)
-- authority interaction lands a row here. Country-agnostic; optionally linked to
-- a submission (0203/0206) and/or a certificate (0205). Additive + INERT until a
-- connector or the lifecycle engine writes it (PAUSED). Company-scoped RLS.
-- Depends on 0005, 0018, 0203, 0205.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_compliance_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  submission_id  uuid REFERENCES erp_tax_submissions(id) ON DELETE SET NULL,
  certificate_id uuid REFERENCES erp_compliance_certificates(id) ON DELETE SET NULL,
  reference_type text,
  reference_id   uuid,
  country        text,
  regime         text,
  event_type     text NOT NULL,                  -- 'generated' | 'queued' | 'retry_scheduled' | 'dead_lettered' | ...
  level          text NOT NULL DEFAULT 'info'
                   CHECK (level IN ('info','warn','error')),
  message        text,
  detail         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
-- FK-covering + lookup indexes (schema-health: first index col = FK col).
CREATE INDEX IF NOT EXISTS idx_compliance_logs_company    ON erp_compliance_logs (company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_compliance_logs_submission ON erp_compliance_logs (submission_id);
CREATE INDEX IF NOT EXISTS idx_compliance_logs_cert       ON erp_compliance_logs (certificate_id);
CREATE INDEX IF NOT EXISTS idx_compliance_logs_ref        ON erp_compliance_logs (reference_type, reference_id);

ALTER TABLE erp_compliance_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_compliance_logs_tenant ON erp_compliance_logs;
CREATE POLICY erp_compliance_logs_tenant ON erp_compliance_logs FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
