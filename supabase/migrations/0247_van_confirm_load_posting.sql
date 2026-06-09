-- ============================================================================
-- 0247: Van Sales (Phase B) — ATOMIC confirm-load + ledger posting
-- ----------------------------------------------------------------------------
-- One SECURITY DEFINER function does the WHOLE confirm flow in a single
-- transaction: validate → insert confirmation + lines → post the accepted qty to
-- the stock ledger → set posted_at. Any failure RAISES and rolls EVERYTHING back
-- (no partial confirmation). ONLY the salesman-accepted quantity moves into van
-- stock (warehouse → van transfer; the AFTER-INSERT trigger on erp_stock_movements
-- maintains on-hand). Loaded-but-rejected qty never moves (no auto-deduction);
-- variance raises review, never an automatic financial deduction.
--
-- Validations (trust boundary): manifest exists + is 'loaded'/'pending_confirmation';
-- manifest's company == caller's company; caller is the assigned salesman OR holds
-- stock.adjust (supervisor/keeper) OR platform owner; warehouse = manifest's van;
-- per line 0 <= accepted_qty <= loaded_qty; post only when ≥1 accepted (full reject
-- posts nothing). Idempotent: one confirmation per manifest (returns existing).
-- Mirrors erp_approve_stock_request. Additive; INERT until KAKO_VAN_SALES.
-- ============================================================================

ALTER TABLE erp_van_load_confirmations ADD COLUMN IF NOT EXISTS posted_at timestamptz;

-- Replace the prior single-arg variant (kept clean across already-applied DBs).
DROP FUNCTION IF EXISTS erp_van_confirm_load(uuid);

CREATE OR REPLACE FUNCTION erp_van_confirm_load(
  p_manifest_id     uuid,
  p_status          text,
  p_requires_review boolean,
  p_notes           text,
  p_lines           jsonb   -- [{product_id, loaded_qty, accepted_qty, variance_reason, notes, photo_ref}]
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE
  v_manifest       erp_van_load_manifests;
  v_company        uuid;
  v_caller_company uuid := erp_user_company_id();
  v_uid            uuid := auth.uid();
  v_src            uuid;
  v_conf           uuid;
  v_existing       uuid;
  v_total_accepted numeric := 0;
  v_line           jsonb;
  v_loaded         numeric;
  v_accepted       numeric;
BEGIN
  SELECT * INTO v_manifest FROM erp_van_load_manifests WHERE id = p_manifest_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'manifest not found'; END IF;

  -- Idempotency: exactly one confirmation per manifest → return the existing one.
  SELECT id INTO v_existing FROM erp_van_load_confirmations WHERE manifest_id = p_manifest_id;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  -- Company isolation: the manifest's company must be the caller's.
  SELECT b.company_id INTO v_company FROM erp_branches b WHERE b.id = v_manifest.branch_id;
  IF NOT (erp_is_platform_owner() OR v_company = v_caller_company) THEN
    RAISE EXCEPTION 'forbidden: cross-company';
  END IF;

  -- The load must be ready for confirmation.
  IF v_manifest.status NOT IN ('loaded','pending_confirmation') THEN
    RAISE EXCEPTION 'manifest not ready for confirmation (status=%)', v_manifest.status;
  END IF;

  -- Authorization: the assigned salesman, an authorized supervisor/keeper
  -- (stock.adjust), or the platform owner.
  IF NOT (v_uid = v_manifest.salesman_id OR erp_is_platform_owner() OR erp_user_has_perm('stock.adjust')) THEN
    RAISE EXCEPTION 'forbidden: not the assigned salesman';
  END IF;

  -- Validate every line: 0 <= accepted_qty <= loaded_qty.
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_loaded := COALESCE((v_line->>'loaded_qty')::numeric, 0);
    v_accepted := COALESCE((v_line->>'accepted_qty')::numeric, 0);
    IF v_accepted < 0 THEN RAISE EXCEPTION 'accepted_qty must be non-negative'; END IF;
    IF v_accepted > v_loaded THEN RAISE EXCEPTION 'accepted_qty cannot exceed loaded_qty'; END IF;
    v_total_accepted := v_total_accepted + v_accepted;
  END LOOP;

  -- Create the confirmation (company + van warehouse derived from the manifest).
  INSERT INTO erp_van_load_confirmations
    (company_id, manifest_id, warehouse_id, salesman_id, status, requires_review, review_status, notes, confirmed_by, confirmed_at, created_by)
  VALUES
    (v_company, p_manifest_id, v_manifest.warehouse_id, v_manifest.salesman_id, p_status, p_requires_review,
     CASE WHEN p_requires_review THEN 'pending' ELSE 'none' END, p_notes, v_uid, now(), v_uid)
  RETURNING id INTO v_conf;

  INSERT INTO erp_van_load_confirmation_lines
    (company_id, confirmation_id, product_id, loaded_qty, accepted_qty, variance_qty, variance_reason, notes, photo_ref)
  SELECT v_company, v_conf, (l->>'product_id')::uuid,
         COALESCE((l->>'loaded_qty')::numeric, 0), COALESCE((l->>'accepted_qty')::numeric, 0),
         COALESCE((l->>'accepted_qty')::numeric, 0) - COALESCE((l->>'loaded_qty')::numeric, 0),
         NULLIF(l->>'variance_reason',''), NULLIF(l->>'notes',''), NULLIF(l->>'photo_ref','')
  FROM jsonb_array_elements(p_lines) l;

  -- Post the ledger ONLY when ≥1 unit was accepted (full reject posts nothing).
  IF v_total_accepted > 0 THEN
    SELECT sr.from_warehouse_id INTO v_src FROM erp_stock_requests sr WHERE sr.id = v_manifest.stock_request_id;
    IF v_src IS NULL THEN RAISE EXCEPTION 'no source warehouse for this load'; END IF;

    INSERT INTO erp_stock_movements (movement_type, warehouse_id, product_id, quantity, reference_type, reference_id, notes, created_by)
    SELECT 'transfer_out', v_src, l.product_id, -abs(l.accepted_qty), 'van_load_confirmation', v_conf, 'تأكيد تحميل الشاحنة', v_uid
    FROM erp_van_load_confirmation_lines l WHERE l.confirmation_id = v_conf AND l.accepted_qty > 0;

    INSERT INTO erp_stock_movements (movement_type, warehouse_id, product_id, quantity, reference_type, reference_id, notes, created_by)
    SELECT 'transfer_in', v_manifest.warehouse_id, l.product_id, abs(l.accepted_qty), 'van_load_confirmation', v_conf, 'تأكيد تحميل الشاحنة', v_uid
    FROM erp_van_load_confirmation_lines l WHERE l.confirmation_id = v_conf AND l.accepted_qty > 0;
  END IF;

  UPDATE erp_van_load_confirmations SET posted_at = now() WHERE id = v_conf;
  PERFORM erp_log_audit('van_load_confirm', 'van_load_confirmation', v_conf::text,
    jsonb_build_object('status', p_status, 'manifest_id', p_manifest_id,
      'total_accepted', v_total_accepted, 'requires_review', p_requires_review), v_company);
  RETURN v_conf;
END;
$$;

REVOKE ALL ON FUNCTION erp_van_confirm_load(uuid, text, boolean, text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION erp_van_confirm_load(uuid, text, boolean, text, jsonb) TO authenticated;

-- ── Rollback (manual): DROP FUNCTION erp_van_confirm_load(uuid,text,boolean,text,jsonb); ──
