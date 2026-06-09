-- ============================================================================
-- 0247: Van Sales (Phase B) — post a CONFIRMED van load to the stock ledger
-- ----------------------------------------------------------------------------
-- The financial/inventory posting gate: ONLY the salesman-accepted quantity moves
-- into van stock, and only on confirmation. erp_van_confirm_load() posts a balanced
-- warehouse → van transfer (transfer_out from the source warehouse + transfer_in to
-- the van) for accepted_qty per line; the existing AFTER-INSERT trigger on
-- erp_stock_movements (0005) maintains on-hand (erp_inventory_stock). Loaded-but-
-- rejected quantity never moves (no auto-deduction). Idempotent via posted_at.
-- Variance is informational + raises review (erp_van_load_confirmations.review_status)
-- — never an automatic financial deduction. Mirrors erp_approve_stock_request (0011),
-- gated on confirmation + accepted_qty. Additive; INERT until KAKO_VAN_SALES.
-- Depends on 0246 + 0011/0194 + 0005 (ledger + trigger).
-- ============================================================================

ALTER TABLE erp_van_load_confirmations ADD COLUMN IF NOT EXISTS posted_at timestamptz;

CREATE OR REPLACE FUNCTION erp_van_confirm_load(p_confirmation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE
  v_conf     erp_van_load_confirmations;
  v_manifest erp_van_load_manifests;
  v_src      uuid;
  v_uid      uuid := auth.uid();
BEGIN
  SELECT * INTO v_conf FROM erp_van_load_confirmations WHERE id = p_confirmation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'confirmation not found'; END IF;
  IF NOT (erp_is_platform_owner() OR v_conf.company_id = erp_user_company_id()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v_conf.posted_at IS NOT NULL THEN RETURN; END IF;   -- idempotent: already posted

  SELECT * INTO v_manifest FROM erp_van_load_manifests WHERE id = v_conf.manifest_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'manifest not found'; END IF;

  -- Source warehouse = the request's from-warehouse (request-based load). Supervisor
  -- direct loads (no stock_request) are posted by a later increment.
  SELECT sr.from_warehouse_id INTO v_src FROM erp_stock_requests sr WHERE sr.id = v_manifest.stock_request_id;
  IF v_src IS NULL THEN RAISE EXCEPTION 'no source warehouse for this load'; END IF;

  -- Post ONLY accepted quantities, warehouse → van (the trigger maintains on-hand).
  INSERT INTO erp_stock_movements (movement_type, warehouse_id, product_id, quantity, reference_type, reference_id, notes, created_by)
  SELECT 'transfer_out', v_src, l.product_id, -abs(l.accepted_qty), 'van_load_confirmation', p_confirmation_id, 'تأكيد تحميل الشاحنة', v_uid
  FROM erp_van_load_confirmation_lines l WHERE l.confirmation_id = p_confirmation_id AND l.accepted_qty > 0;

  INSERT INTO erp_stock_movements (movement_type, warehouse_id, product_id, quantity, reference_type, reference_id, notes, created_by)
  SELECT 'transfer_in', v_manifest.warehouse_id, l.product_id, abs(l.accepted_qty), 'van_load_confirmation', p_confirmation_id, 'تأكيد تحميل الشاحنة', v_uid
  FROM erp_van_load_confirmation_lines l WHERE l.confirmation_id = p_confirmation_id AND l.accepted_qty > 0;

  UPDATE erp_van_load_confirmations
     SET posted_at = now(),
         confirmed_at = COALESCE(confirmed_at, now()),
         confirmed_by = COALESCE(confirmed_by, v_uid)
   WHERE id = p_confirmation_id;
END;
$$;

REVOKE ALL ON FUNCTION erp_van_confirm_load(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION erp_van_confirm_load(uuid) TO authenticated;

-- ── Rollback (manual): DROP FUNCTION erp_van_confirm_load(uuid); ─────────────
