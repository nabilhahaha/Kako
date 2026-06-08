-- ============================================================================
-- 0228: Entity 360 Platform — generic entity timeline (Phase 7)
-- ----------------------------------------------------------------------------
-- Generalizes the customer timeline (0216) to ANY entity (product/category/brand/
-- salesman/supervisor/area/region/route/promotion/customer) so every "360" shares
-- one immutable, append-only business-history index — adding a new 360 needs no
-- schema redesign. References related records (no data duplication). IMMUTABLE via
-- RLS (SELECT + INSERT only). Additive + INERT until KAKO_ENTITY360 is on.
-- Company-scoped. Depends on 0005, 0018.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_entity_timeline (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  entity_type         text NOT NULL,    -- customer|product|category|brand|salesman|supervisor|area_manager|region|route|promotion
  entity_id           uuid NOT NULL,
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
  attachment_ref      text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
-- FK-covering (first index col = FK col) + feed + related-record lookups.
CREATE INDEX IF NOT EXISTS idx_entity_timeline_company ON erp_entity_timeline (company_id, event_at);
CREATE INDEX IF NOT EXISTS idx_entity_timeline_entity  ON erp_entity_timeline (entity_type, entity_id, event_at);
CREATE INDEX IF NOT EXISTS idx_entity_timeline_related ON erp_entity_timeline (related_record_type, related_record_id);

ALTER TABLE erp_entity_timeline ENABLE ROW LEVEL SECURITY;
-- Immutable: only SELECT + INSERT (no UPDATE/DELETE policy → those are denied).
DROP POLICY IF EXISTS erp_entity_timeline_select ON erp_entity_timeline;
CREATE POLICY erp_entity_timeline_select ON erp_entity_timeline FOR SELECT
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id());
DROP POLICY IF EXISTS erp_entity_timeline_insert ON erp_entity_timeline;
CREATE POLICY erp_entity_timeline_insert ON erp_entity_timeline FOR INSERT
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
