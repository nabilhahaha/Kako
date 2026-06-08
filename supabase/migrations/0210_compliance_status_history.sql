-- ============================================================================
-- 0210: Global Tax Compliance — status-change history (Phase 5G, Part 1.5/1.6)
-- ----------------------------------------------------------------------------
-- Append-only history of every lifecycle status change on a submission — the
-- "Submission History" + "Status Change History" the audit requirements ask for,
-- complementing the free-form erp_compliance_logs. Country-agnostic; one row per
-- transition (from→to, who, when, why). Additive + INERT until the lifecycle
-- engine writes it (PAUSED). Company-scoped RLS. Depends on 0005, 0018, 0203.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_compliance_status_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL REFERENCES erp_tax_submissions(id) ON DELETE CASCADE,
  from_status   text,
  to_status     text NOT NULL,
  reason        text,
  changed_by    uuid,                              -- erp_invoices convention: uuid, no FK
  changed_at    timestamptz NOT NULL DEFAULT now()
);
-- FK-covering + lookup indexes (schema-health: first index col = FK col).
CREATE INDEX IF NOT EXISTS idx_compliance_status_hist_company    ON erp_compliance_status_history (company_id, changed_at);
CREATE INDEX IF NOT EXISTS idx_compliance_status_hist_submission ON erp_compliance_status_history (submission_id);

ALTER TABLE erp_compliance_status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_compliance_status_hist_tenant ON erp_compliance_status_history;
CREATE POLICY erp_compliance_status_hist_tenant ON erp_compliance_status_history FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
