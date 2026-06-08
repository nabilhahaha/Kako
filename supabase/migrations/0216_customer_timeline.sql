-- ============================================================================
-- 0216: Customer Relationship Timeline (Phase 3 FMCG)
-- ----------------------------------------------------------------------------
-- A permanent, IMMUTABLE, append-only business-history index of every significant
-- customer event across all modules (not a notes field). References related
-- records (no data duplication); ownership events are sourced from the ownership
-- ledger (0214). Immutability is enforced by RLS: SELECT + INSERT policies only —
-- no UPDATE/DELETE policy, so (with RLS on) edits/deletes are denied. Additive +
-- INERT until KAKO_CUSTOMER_TIMELINE is on. Company-scoped. Depends on 0005, 0018.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_customer_timeline (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  customer_id         uuid NOT NULL REFERENCES erp_customers(id) ON DELETE CASCADE,
  event_type          text NOT NULL,
  event_category      text NOT NULL,
  event_at            timestamptz NOT NULL DEFAULT now(),
  user_id             uuid,
  role                text,
  source_module       text,
  before_value        jsonb,
  after_value         jsonb,
  reason              text,
  notes               text,
  related_record_type text,
  related_record_id   uuid,
  related_entity      text,
  attachment_ref      text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
-- FK-covering (first index col = FK col) + feed + related-record lookups.
CREATE INDEX IF NOT EXISTS idx_customer_timeline_company  ON erp_customer_timeline (company_id, event_at);
CREATE INDEX IF NOT EXISTS idx_customer_timeline_customer ON erp_customer_timeline (customer_id, event_at);
CREATE INDEX IF NOT EXISTS idx_customer_timeline_category ON erp_customer_timeline (company_id, event_category, event_at);
CREATE INDEX IF NOT EXISTS idx_customer_timeline_related  ON erp_customer_timeline (related_record_type, related_record_id);

ALTER TABLE erp_customer_timeline ENABLE ROW LEVEL SECURITY;
-- Immutable: only SELECT + INSERT (no UPDATE/DELETE policy → those are denied).
DROP POLICY IF EXISTS erp_customer_timeline_select ON erp_customer_timeline;
CREATE POLICY erp_customer_timeline_select ON erp_customer_timeline FOR SELECT
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id());
DROP POLICY IF EXISTS erp_customer_timeline_insert ON erp_customer_timeline;
CREATE POLICY erp_customer_timeline_insert ON erp_customer_timeline FOR INSERT
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
