-- ============================================================================
-- 0204: Universal Integration Hub — cross-reference (xref) model (Phase 6A)
-- ----------------------------------------------------------------------------
-- The external↔VANTORA id cross-reference that makes mapping + re-sync idempotent
-- (proposal §4): per (connection, entity), an external system's id maps to the
-- internal VANTORA record id. The Mapping Studio (6B) + sync ingest read/write
-- this so re-runs never duplicate. Additive + INERT until KAKO_INTEGRATION_HUB is
-- on. Company-scoped RLS; connection FK to erp_integrations (0093).
-- Depends on 0005/0018, 0093 (erp_integrations).
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_integration_xref (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  connection_id   uuid NOT NULL REFERENCES erp_integrations(id) ON DELETE CASCADE,
  entity          text NOT NULL,            -- 'customer' | 'product' | 'invoice' | 'order' | 'warehouse' | 'route' | 'salesman' | 'tax_code'
  external_id     text NOT NULL,            -- id in the external system
  internal_id     uuid,                     -- VANTORA record id (null until linked)
  external_ref    jsonb NOT NULL DEFAULT '{}'::jsonb,  -- extra external keys/metadata
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, entity, external_id)
);
-- FK-covering + reverse-lookup indexes (schema-health: first index col = FK col).
CREATE INDEX IF NOT EXISTS idx_integration_xref_company    ON erp_integration_xref (company_id);
CREATE INDEX IF NOT EXISTS idx_integration_xref_connection ON erp_integration_xref (connection_id, entity);
CREATE INDEX IF NOT EXISTS idx_integration_xref_internal   ON erp_integration_xref (connection_id, entity, internal_id);

ALTER TABLE erp_integration_xref ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_integration_xref_tenant ON erp_integration_xref;
CREATE POLICY erp_integration_xref_tenant ON erp_integration_xref FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
