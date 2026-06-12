-- ============================================================================
-- 0292 — ETA e-invoicing item code (activation readiness)
-- ----------------------------------------------------------------------------
-- The Egyptian Tax Authority requires each invoice line to carry a registered
-- item code (GS1 barcode or an EGS code). This optional column holds the EGS code
-- per product; the readiness assessment tracks coverage. A barcode already
-- satisfies the GS1 path. Safe to re-run.
-- ============================================================================
ALTER TABLE erp_products_catalog ADD COLUMN IF NOT EXISTS egs_code text;
