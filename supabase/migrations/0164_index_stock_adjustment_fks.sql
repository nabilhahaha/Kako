-- ============================================================================
-- 0164: Covering indexes for erp_stock_adjustments foreign keys
-- ----------------------------------------------------------------------------
-- 0163 added erp_stock_adjustments with two foreign keys to erp_stock_movements
-- (movement_id, reversal_movement_id, both ON DELETE SET NULL) but no covering
-- index. The schema-health scalability invariant (src/test/integration/
-- schema-health.test.ts) requires every erp_ foreign key's first column to be
-- the first column of some index — an unindexed FK means seq-scan joins and a
-- slow SET NULL on cascade. This adds the missing covering indexes.
--
-- Additive + idempotent. No data change, no behavioural change.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_erp_stock_adjustments_movement
  ON erp_stock_adjustments(movement_id);

CREATE INDEX IF NOT EXISTS idx_erp_stock_adjustments_reversal_movement
  ON erp_stock_adjustments(reversal_movement_id);
