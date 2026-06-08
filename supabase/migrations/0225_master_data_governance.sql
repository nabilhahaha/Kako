-- ============================================================================
-- 0225: Commercial Excellence — Master Data Governance (Phase 7, 6B)
-- ----------------------------------------------------------------------------
-- Generic master-data change-request workflow across governed entities
-- (customer/product/route/territory/price/vat/gps/supplier) + an IMMUTABLE audit
-- log (old/new/by/when/reason). Generalizes the customer-approval (0109) +
-- field-governance (0114) patterns. INERT until KAKO_COMMERCIAL is on. Company-
-- scoped RLS. Depends on 0005, 0018.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_mdg_change_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  entity        text NOT NULL CHECK (entity IN ('customer','product','route','territory','price','vat','gps','supplier')),
  entity_id     uuid,
  field         text NOT NULL,
  old_value     jsonb,
  new_value     jsonb,
  reason        text,
  status        text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','submitted','under_review','approved','rejected')),
  current_stage text,
  requested_by  uuid,
  reviewed_by   uuid,
  approved_by   uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mdg_requests_company ON erp_mdg_change_requests (company_id, status);
CREATE INDEX IF NOT EXISTS idx_mdg_requests_entity  ON erp_mdg_change_requests (entity, entity_id);
ALTER TABLE erp_mdg_change_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_mdg_requests_tenant ON erp_mdg_change_requests;
CREATE POLICY erp_mdg_requests_tenant ON erp_mdg_change_requests FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Immutable MDG audit log (SELECT + INSERT only; no UPDATE/DELETE policy).
CREATE TABLE IF NOT EXISTS erp_mdg_audit_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  change_request_id uuid REFERENCES erp_mdg_change_requests(id) ON DELETE SET NULL,
  entity            text NOT NULL,
  entity_id         uuid,
  field             text NOT NULL,
  old_value         jsonb,
  new_value         jsonb,
  changed_by        uuid,
  approval_by       uuid,
  reason            text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mdg_audit_company ON erp_mdg_audit_log (company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mdg_audit_request ON erp_mdg_audit_log (change_request_id);
ALTER TABLE erp_mdg_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_mdg_audit_select ON erp_mdg_audit_log;
CREATE POLICY erp_mdg_audit_select ON erp_mdg_audit_log FOR SELECT
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id());
DROP POLICY IF EXISTS erp_mdg_audit_insert ON erp_mdg_audit_log;
CREATE POLICY erp_mdg_audit_insert ON erp_mdg_audit_log FOR INSERT
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
