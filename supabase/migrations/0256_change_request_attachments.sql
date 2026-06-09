-- ============================================================================
-- 0256: Change Request engine — Phase 5: attachment document classification
-- ----------------------------------------------------------------------------
-- Adds a NULLABLE `doc_type` column to the shared erp_attachments table — the
-- primary, queryable document classification going forward (CR copy, VAT cert,
-- national address, contract, …). Backward-compatible: every existing row keeps
-- doc_type NULL and all current flows are unaffected. Document CATEGORIES live in
-- the erp_change_request_doc_types registry (seeded in 0253), so industry packs
-- introduce new categories without a schema change; doc_type references a doc_key.
-- Additive; the change-request engine remains INERT until KAKO_CHANGE_REQUESTS.
-- ============================================================================

ALTER TABLE erp_attachments ADD COLUMN IF NOT EXISTS doc_type text;

-- Find documents of a given type fast (e.g. "all VAT certificates for this record").
CREATE INDEX IF NOT EXISTS idx_attachments_doc_type
  ON erp_attachments (company_id, entity, doc_type)
  WHERE doc_type IS NOT NULL AND deleted_at IS NULL;

-- ── Rollback (manual): ALTER TABLE erp_attachments DROP COLUMN IF EXISTS doc_type; ──
