-- ============================================================================
-- 0313: Load (stock) request — requested vs approved loading date
-- ----------------------------------------------------------------------------
-- The salesman picks a Requested Loading Date; the warehouse/admin can approve
-- as-is or change it BEFORE approval. Any date change is fully audited (original
-- stays in requested_date; the adjusted date + who/when/note are stored) — no
-- silent changes. Both dates are visible to the salesman + the warehouse.
-- Additive + reversible.
-- ============================================================================
ALTER TABLE erp_stock_requests ADD COLUMN IF NOT EXISTS requested_date  DATE;
ALTER TABLE erp_stock_requests ADD COLUMN IF NOT EXISTS approved_date   DATE;
ALTER TABLE erp_stock_requests ADD COLUMN IF NOT EXISTS date_changed_by UUID;
ALTER TABLE erp_stock_requests ADD COLUMN IF NOT EXISTS date_changed_at TIMESTAMPTZ;
ALTER TABLE erp_stock_requests ADD COLUMN IF NOT EXISTS date_change_note TEXT;
