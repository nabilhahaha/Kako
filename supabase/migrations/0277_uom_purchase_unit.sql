-- ============================================================================
-- 0277 — Multi-unit (UoM) engine completion: purchase unit + base backfill
-- ----------------------------------------------------------------------------
-- REUSE, don't rebuild. The conversion engine already exists:
--   • erp_product_uoms (uom, factor vs base, per-UoM barcode, is_case) — the
--     conversion table, managed at /settings/uom (perm uom.manage).
--   • erp_products_catalog.base_uom (base & INVENTORY unit), sales_uom /
--     default_sell_uom (SALES unit).
-- Missing only an explicit PURCHASE unit designation; add it. Inventory unit =
-- base_uom (stock is always tracked in the base unit so conversions stay sane).
-- Platform-wide: these columns/tables are industry-agnostic (pharmacy box→strip→
-- tablet, FMCG carton→pack→piece, …).
-- ============================================================================
ALTER TABLE erp_products_catalog
  ADD COLUMN IF NOT EXISTS purchase_uom text;

-- Base & inventory unit defaults to the legacy single `unit` when unset.
UPDATE erp_products_catalog SET base_uom = unit
WHERE base_uom IS NULL AND unit IS NOT NULL;
