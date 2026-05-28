-- ============================================================================
-- 0010: Physical stock counts (الجرد) + variance reconciliation
-- ----------------------------------------------------------------------------
-- A stock count snapshots the system quantity per product in a warehouse, lets
-- staff enter the counted quantity, and on finalize posts adjustment movements
-- for the variance (عجز/زيادة) so on-hand matches reality. Works for any
-- warehouse (including van warehouses). Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_stock_counts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id  UUID NOT NULL REFERENCES erp_warehouses(id) ON DELETE CASCADE,
  count_number  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft', -- draft | completed | cancelled
  notes         TEXT,
  counted_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_erp_stock_counts_warehouse ON erp_stock_counts(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_erp_stock_counts_status ON erp_stock_counts(status);

CREATE TABLE IF NOT EXISTS erp_stock_count_lines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id    UUID NOT NULL REFERENCES erp_stock_counts(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES erp_products_catalog(id) ON DELETE RESTRICT,
  system_qty  NUMERIC(14,3) NOT NULL DEFAULT 0,
  counted_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(count_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_erp_stock_count_lines_count ON erp_stock_count_lines(count_id);

ALTER TABLE erp_stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_stock_count_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "erp_stock_counts_all" ON erp_stock_counts;
CREATE POLICY "erp_stock_counts_all" ON erp_stock_counts FOR ALL
  USING (warehouse_id IN (SELECT w.id FROM erp_warehouses w WHERE w.branch_id = ANY(erp_user_branch_ids())));

DROP POLICY IF EXISTS "erp_stock_count_lines_all" ON erp_stock_count_lines;
CREATE POLICY "erp_stock_count_lines_all" ON erp_stock_count_lines FOR ALL
  USING (count_id IN (
    SELECT c.id FROM erp_stock_counts c
    WHERE c.warehouse_id IN (SELECT w.id FROM erp_warehouses w WHERE w.branch_id = ANY(erp_user_branch_ids()))
  ));

-- Finalize: post adjustment movements for every variance, then mark completed.
CREATE OR REPLACE FUNCTION erp_finalize_stock_count(p_count_id UUID)
RETURNS VOID AS $$
DECLARE
  v_c erp_stock_counts;
  v_branch UUID;
  v_uid UUID := auth.uid();
BEGIN
  SELECT * INTO v_c FROM erp_stock_counts WHERE id = p_count_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الجرد غير موجود'; END IF;
  SELECT branch_id INTO v_branch FROM erp_warehouses WHERE id = v_c.warehouse_id;
  IF NOT erp_has_branch_access(v_branch) THEN RAISE EXCEPTION 'غير مصرح بالوصول لهذا الفرع'; END IF;
  IF v_c.status = 'completed' THEN RAISE EXCEPTION 'تم اعتماد هذا الجرد بالفعل'; END IF;
  IF v_c.status = 'cancelled' THEN RAISE EXCEPTION 'الجرد ملغي'; END IF;

  INSERT INTO erp_stock_movements (movement_type, warehouse_id, product_id, quantity, reference_type, reference_id, notes, created_by)
  SELECT 'adjustment', v_c.warehouse_id, l.product_id, (l.counted_qty - l.system_qty),
         'stock_count', p_count_id, 'تسوية جرد: ' || v_c.count_number, v_uid
  FROM erp_stock_count_lines l
  WHERE l.count_id = p_count_id AND l.counted_qty <> l.system_qty;

  UPDATE erp_stock_counts SET status = 'completed', completed_at = now() WHERE id = p_count_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
