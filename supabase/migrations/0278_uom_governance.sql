-- ============================================================================
-- 0278 — Unit governance: per-product selling rules + fractional control
-- ----------------------------------------------------------------------------
-- Layers governance on the platform multi-unit engine (0277). Per product:
--   • sell_mode       — which units may be SOLD: base-only / sales-only / all.
--   • allow_fractional — whether non-integer quantities are permitted (e.g. a
--     water carton sold "carton only" with whole numbers).
-- Purchase/receiving units reuse purchase_uom (0277); inventory is always the
-- base unit (all stock movements store base-unit quantities). Platform-wide and
-- industry-agnostic.
-- ============================================================================
ALTER TABLE erp_products_catalog
  ADD COLUMN IF NOT EXISTS sell_mode text NOT NULL DEFAULT 'all'
    CHECK (sell_mode IN ('base', 'sales', 'all')),
  ADD COLUMN IF NOT EXISTS allow_fractional boolean NOT NULL DEFAULT false;
