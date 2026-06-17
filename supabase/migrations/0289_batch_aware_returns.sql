-- ============================================================================
-- 0289 — Batch-aware sales returns (pharmacy)
-- ----------------------------------------------------------------------------
-- A pharmacy return must restock the SPECIFIC batch the goods belong to, so
-- batch quantities, FEFO and expiry stay correct (the generic return only moves
-- inventory_stock). Return lines carry the batch; erp_pharmacy_return_restock_
-- batches restores each line's qty into the matching batch (by product + batch
-- number), creating the batch when it no longer exists (with its expiry). Called
-- right after the generic erp_complete_sales_return, which already did the
-- inventory_stock/journal/AR legs. Tenant-scoped. Safe to re-run.
-- ============================================================================
ALTER TABLE erp_sales_return_lines
  ADD COLUMN IF NOT EXISTS batch_number text,
  ADD COLUMN IF NOT EXISTS expiry_date date;

CREATE OR REPLACE FUNCTION erp_pharmacy_return_restock_batches(p_return_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_ret erp_sales_returns; v_co uuid := erp_user_company_id(); v_wh uuid; l record;
BEGIN
  SELECT * INTO v_ret FROM erp_sales_returns WHERE id = p_return_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT erp_has_branch_access(v_ret.branch_id) THEN RAISE EXCEPTION 'غير مصرح بالوصول لهذا الفرع'; END IF;

  SELECT id INTO v_wh FROM erp_warehouses WHERE branch_id = v_ret.branch_id AND is_active = true ORDER BY code LIMIT 1;

  FOR l IN
    SELECT product_id, abs(quantity) AS qty, batch_number, expiry_date
    FROM erp_sales_return_lines
    WHERE return_id = p_return_id AND batch_number IS NOT NULL AND btrim(batch_number) <> ''
  LOOP
    -- Increment the matching live batch; if none, recreate it (returns can revive
    -- a sold-out batch). cost falls back to the product cost.
    UPDATE erp_product_batches
       SET qty_on_hand = qty_on_hand + l.qty, updated_at = now()
     WHERE company_id = v_co AND product_id = l.product_id
       AND COALESCE(batch_number,'') = l.batch_number
       AND id = (SELECT id FROM erp_product_batches
                 WHERE company_id = v_co AND product_id = l.product_id
                   AND COALESCE(batch_number,'') = l.batch_number
                 ORDER BY qty_on_hand DESC LIMIT 1);
    IF NOT FOUND THEN
      INSERT INTO erp_product_batches (company_id, product_id, warehouse_id, batch_number, expiry_date, qty_on_hand, cost_price)
      VALUES (v_co, l.product_id, v_wh, l.batch_number, l.expiry_date, l.qty,
              (SELECT cost_price FROM erp_products_catalog WHERE id = l.product_id));
    END IF;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION erp_pharmacy_return_restock_batches(uuid) TO authenticated, service_role;
