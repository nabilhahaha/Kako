-- ============================================================================
-- Electrical demo — sample Supplier (purchase) Returns for Demo Electric
-- ----------------------------------------------------------------------------
-- Demo data only. Adds 8 realistic supplier-return records (with lines) so the
-- /purchases/returns screen has content to demonstrate. Idempotent (fixed
-- DPR-* numbers, guarded by NOT EXISTS). Uses existing tables/columns only.
-- Scoped to the Demo Electric tenant.
-- ============================================================================
DO $sr$
DECLARE
  v_company UUID := '6541791e-0f81-4a11-9f61-51aa34db7ace';
  v_branch  UUID;
  v_supp UUID[]; v_prod UUID[];
  v_ret UUID; v_qty NUMERIC; v_price NUMERIC; v_total NUMERIC; v_pid UUID;
  i INT; j INT;
  v_status TEXT;
  v_reasons TEXT[] := ARRAY['Defective batch','Wrong items shipped','Damaged in transit','Failed QC inspection','Over-supplied quantity','Expired/old stock','Warranty claim to vendor','Not as specified'];
BEGIN
  SELECT id INTO v_branch FROM erp_branches WHERE company_id = v_company ORDER BY created_at LIMIT 1;
  SELECT array_agg(id ORDER BY code) INTO v_supp FROM erp_suppliers WHERE company_id = v_company AND code LIKE 'DS-%';
  SELECT array_agg(id ORDER BY code) INTO v_prod FROM erp_products_catalog WHERE company_id = v_company AND code LIKE 'DP-%';
  IF v_branch IS NULL OR v_supp IS NULL OR v_prod IS NULL THEN
    RAISE EXCEPTION 'demo prerequisites missing (branch/suppliers/products)';
  END IF;

  FOR i IN 1..8 LOOP
    -- statuses: mostly completed, a couple approved/draft for variety
    v_status := (ARRAY['completed','completed','completed','completed','approved','approved','draft','cancelled'])[i];
    IF EXISTS (SELECT 1 FROM erp_purchase_returns WHERE return_number = 'DPR-'||lpad(i::text,4,'0')) THEN
      CONTINUE;
    END IF;
    INSERT INTO erp_purchase_returns (branch_id, supplier_id, return_number, status, total_amount, reason, notes, created_at)
    VALUES (v_branch, v_supp[1 + (i % array_length(v_supp,1))], 'DPR-'||lpad(i::text,4,'0'),
            v_status::erp_return_status, 0, v_reasons[1 + (i % array_length(v_reasons,1))],
            'Demo supplier return', now() - (i * 36 || ' hours')::interval)
    RETURNING id INTO v_ret;

    v_total := 0;
    FOR j IN 1..(1 + (i % 3)) LOOP
      v_pid := v_prod[1 + ((i*4 + j) % array_length(v_prod,1))];
      v_qty := 1 + ((i + j) % 4);
      SELECT cost_price INTO v_price FROM erp_products_catalog WHERE id = v_pid;
      INSERT INTO erp_purchase_return_lines (return_id, product_id, quantity, unit_price, line_total)
      VALUES (v_ret, v_pid, v_qty, v_price, v_qty * v_price);
      v_total := v_total + v_qty * v_price;
    END LOOP;
    UPDATE erp_purchase_returns SET total_amount = v_total WHERE id = v_ret;
  END LOOP;
END $sr$;
