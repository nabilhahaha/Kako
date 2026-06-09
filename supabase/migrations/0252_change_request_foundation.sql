-- ============================================================================
-- 0252: Universal Change Request engine — Phase 1: registry & metadata foundation
-- ----------------------------------------------------------------------------
-- A reusable, metadata-driven platform capability: any master-data entity can be
-- changed through a governed, audited, approved request — WITHOUT engine code.
-- New entities are added by registering METADATA (a row here), not by editing the
-- engine. See docs/architecture/platform/CHANGE-REQUEST-ENGINE-DESIGN.md.
--
-- This migration lays the foundation ONLY (tables + RLS + stamps). No entity is
-- registered yet (the `customer` reference entity arrives in Phase 2). Additive;
-- INERT until KAKO_CHANGE_REQUESTS. Two registry tables (doc-types, entities)
-- allow GLOBAL defaults (company_id IS NULL, readable by every tenant) with
-- per-company overrides — mirroring erp_forms / global workflow definitions.
-- The three request tables (header, targets, values) are strictly company-scoped.
-- ============================================================================

-- ── Doc-type registry — document categories (CR copy, VAT cert, contract …) ──
-- Global defaults + per-company additions, so industry packs introduce new
-- categories without a schema change. Referenced by entity attachment_types.
CREATE TABLE IF NOT EXISTS erp_change_request_doc_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid REFERENCES erp_companies(id) ON DELETE CASCADE,   -- NULL = global default
  doc_key     text NOT NULL,
  label_en    text,
  label_ar    text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cr_doc_types_company ON erp_change_request_doc_types (company_id, doc_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cr_doc_types_global  ON erp_change_request_doc_types (doc_key) WHERE company_id IS NULL;
ALTER TABLE erp_change_request_doc_types ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS erp_cr_doc_types_set_company ON erp_change_request_doc_types;
CREATE TRIGGER erp_cr_doc_types_set_company BEFORE INSERT ON erp_change_request_doc_types
  FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();
DROP TRIGGER IF EXISTS erp_cr_doc_types_updated ON erp_change_request_doc_types;
CREATE TRIGGER erp_cr_doc_types_updated BEFORE UPDATE ON erp_change_request_doc_types
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();
DROP POLICY IF EXISTS erp_cr_doc_types_read ON erp_change_request_doc_types;
CREATE POLICY erp_cr_doc_types_read ON erp_change_request_doc_types FOR SELECT
  USING (erp_is_platform_owner() OR company_id IS NULL OR company_id = erp_user_company_id());
DROP POLICY IF EXISTS erp_cr_doc_types_write ON erp_change_request_doc_types;
CREATE POLICY erp_cr_doc_types_write ON erp_change_request_doc_types FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- ── Entity-type registry — the metadata source of truth ─────────────────────
-- One row per governed entity type. company_id IS NULL = platform/global default
-- (seeded by core or an industry-pack migration); a row with company_id = tenant
-- override/addition. Resolution = company row first, else global.
CREATE TABLE IF NOT EXISTS erp_change_request_entities (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                uuid REFERENCES erp_companies(id) ON DELETE CASCADE,  -- NULL = global default
  entity_key                text NOT NULL,
  target_table              text NOT NULL,                 -- must be in the CR apply allowlist (enforced in code/apply)
  id_column                 text NOT NULL DEFAULT 'id',
  label_en                  text,
  label_ar                  text,
  create_permission         text,                          -- permission to raise a request
  approve_permission        text,                          -- permission an approver needs
  workflow_key              text,                          -- NULL → engine uses 'change_request:'||entity_key
  allowed_fields            jsonb,                         -- NULL → DFG governs which fields are changeable
  validation                jsonb NOT NULL DEFAULT '{}'::jsonb,
  attachment_types          jsonb NOT NULL DEFAULT '[]'::jsonb,  -- array of doc_key
  supports_effective_dating boolean NOT NULL DEFAULT true,
  supports_bulk             boolean NOT NULL DEFAULT true,
  bulk_max                  integer NOT NULL DEFAULT 1000,
  notification_template     text,
  is_active                 boolean NOT NULL DEFAULT true,
  created_by                uuid,
  updated_by                uuid,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cr_entities_company ON erp_change_request_entities (company_id, entity_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cr_entities_global  ON erp_change_request_entities (entity_key) WHERE company_id IS NULL;
ALTER TABLE erp_change_request_entities ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS erp_cr_entities_set_company ON erp_change_request_entities;
CREATE TRIGGER erp_cr_entities_set_company BEFORE INSERT ON erp_change_request_entities
  FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();
DROP TRIGGER IF EXISTS erp_cr_entities_updated ON erp_change_request_entities;
CREATE TRIGGER erp_cr_entities_updated BEFORE UPDATE ON erp_change_request_entities
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();
DROP POLICY IF EXISTS erp_cr_entities_read ON erp_change_request_entities;
CREATE POLICY erp_cr_entities_read ON erp_change_request_entities FOR SELECT
  USING (erp_is_platform_owner() OR company_id IS NULL OR company_id = erp_user_company_id());
DROP POLICY IF EXISTS erp_cr_entities_write ON erp_change_request_entities;
CREATE POLICY erp_cr_entities_write ON erp_change_request_entities FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- ── Change request header ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_change_requests (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  entity_key           text NOT NULL,
  scope                text NOT NULL DEFAULT 'single'
                         CHECK (scope IN ('single','bulk')),
  status               text NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','submitted','pending','approved','scheduled',
                                           'applying','applied','partially_applied','failed','rejected','cancelled')),
  reason               text,
  effective_at         timestamptz,                       -- NULL/≤now = immediate; future = scheduled
  requested_by         uuid,
  decided_by           uuid,
  decided_at           timestamptz,
  applied_at           timestamptz,
  workflow_instance_id uuid,
  summary              jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_change_requests_company_status ON erp_change_requests (company_id, status);
CREATE INDEX IF NOT EXISTS idx_change_requests_entity ON erp_change_requests (company_id, entity_key);
CREATE INDEX IF NOT EXISTS idx_change_requests_scheduled ON erp_change_requests (status, effective_at)
  WHERE status = 'scheduled';
ALTER TABLE erp_change_requests ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS erp_change_requests_set_company ON erp_change_requests;
CREATE TRIGGER erp_change_requests_set_company BEFORE INSERT ON erp_change_requests
  FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();
DROP TRIGGER IF EXISTS erp_change_requests_updated ON erp_change_requests;
CREATE TRIGGER erp_change_requests_updated BEFORE UPDATE ON erp_change_requests
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();
DROP POLICY IF EXISTS erp_change_requests_tenant ON erp_change_requests;
CREATE POLICY erp_change_requests_tenant ON erp_change_requests FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- ── Change request targets — affected records (bulk = N rows, single = 1) ────
CREATE TABLE IF NOT EXISTS erp_change_request_targets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES erp_change_requests(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  target_id   text NOT NULL,
  status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','applied','failed','skipped')),
  error       text,
  applied_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cr_targets_request ON erp_change_request_targets (request_id);
ALTER TABLE erp_change_request_targets ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS erp_cr_targets_set_company ON erp_change_request_targets;
CREATE TRIGGER erp_cr_targets_set_company BEFORE INSERT ON erp_change_request_targets
  FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();
DROP POLICY IF EXISTS erp_cr_targets_tenant ON erp_change_request_targets;
CREATE POLICY erp_cr_targets_tenant ON erp_change_request_targets FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- ── Change request values — proposed field changes (before/after) ───────────
-- target_id NULL = shared change across all targets; set = per-target override.
CREATE TABLE IF NOT EXISTS erp_change_request_values (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES erp_change_requests(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  target_id   text,
  field_key   text NOT NULL,
  old_value   jsonb,
  new_value   jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cr_values_request ON erp_change_request_values (request_id);
ALTER TABLE erp_change_request_values ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS erp_cr_values_set_company ON erp_change_request_values;
CREATE TRIGGER erp_cr_values_set_company BEFORE INSERT ON erp_change_request_values
  FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();
DROP POLICY IF EXISTS erp_cr_values_tenant ON erp_change_request_values;
CREATE POLICY erp_cr_values_tenant ON erp_change_request_values FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- ── Rollback (manual): DROP TABLE IF EXISTS in reverse dependency order ──────
--   erp_change_request_values, erp_change_request_targets, erp_change_requests,
--   erp_change_request_entities, erp_change_request_doc_types;
