-- ============================================================================
-- 0305: U3 — UoM-aware van-sell (faithful superset of erp_van_sell)
-- ----------------------------------------------------------------------------
-- Reproduces the entire validated erp_van_sell body (auth, branch, idempotency,
-- customer/credit, van, discount cap, stock guard, invoice + issue) and adds
-- per-line UoM handling that DEGRADES to today's behaviour when no uom is given:
--   • uom absent  ⇒ factor 1, base_qty = qty, existing rule-based price → IDENTICAL.
--   • uom present ⇒ factor from erp_product_uoms; base_qty = qty × factor; price =
--     a price-book per-uom special if one exists, else the existing rule-based
--     base price; the line is stored in BASE quantity (stock invariant preserved)
--     with the entered_uom/entered_qty/uom_factor snapshot (U2 columns).
-- Server-authoritative pricing is preserved (no client price). The app only sends
-- a uom when the platform.multi_uom flag is on, so this is flag-gated end-to-end.
--
-- Rollback: re-apply the prior erp_van_sell (0265). No data is transformed; lines
-- created before this remain valid (entered_uom null = base).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.erp_van_sell(
  p_branch_id uuid, p_customer_id uuid, p_lines jsonb,
  p_idempotency_key uuid DEFAULT NULL::uuid, p_due_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(invoice_id uuid, invoice_number text, net_amount numeric)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_company uuid; v_is_approved boolean; v_credit_limit numeric;
  v_balance numeric; v_wh uuid; v_cap numeric; v_allow_neg boolean := false;
  v_line jsonb; v_pid uuid; v_qty numeric; v_disc numeric; v_price numeric; v_tax numeric;
  v_gross numeric; v_ldisc numeric; v_lnet numeric; v_ltax numeric;
  v_total numeric := 0; v_discount numeric := 0; v_taxsum numeric := 0; v_net numeric;
  v_nlines int := 0; v_priced jsonb := '[]'::jsonb; v_invid uuid; v_invno text;
  v_uom text; v_factor numeric; v_baseqty numeric; v_uomprice numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT erp_has_branch_access(p_branch_id) THEN RAISE EXCEPTION 'branch_access_denied'; END IF;

  SELECT b.company_id INTO v_company FROM erp_branches b WHERE b.id = p_branch_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'branch_not_found'; END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT i.id, i.invoice_number, i.net_amount INTO v_invid, v_invno, v_net
      FROM erp_invoices i WHERE i.idempotency_key = p_idempotency_key;
    IF FOUND THEN
      invoice_id := v_invid; invoice_number := v_invno; net_amount := v_net;
      RETURN NEXT; RETURN;
    END IF;
  END IF;

  SELECT c.is_approved, c.credit_limit, c.balance
    INTO v_is_approved, v_credit_limit, v_balance
    FROM erp_customers c WHERE c.id = p_customer_id AND c.company_id = v_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer_not_found'; END IF;
  IF v_is_approved IS FALSE THEN RAISE EXCEPTION 'customer_not_approved'; END IF;

  SELECT w.id INTO v_wh FROM erp_warehouses w
   WHERE w.branch_id = p_branch_id AND w.is_active AND w.is_van AND w.assigned_to = v_uid
   ORDER BY w.code LIMIT 1;
  IF v_wh IS NULL THEN RAISE EXCEPTION 'no_van_assigned'; END IF;

  SELECT s.discount_cap_pct, s.allow_negative_van_stock INTO v_cap, v_allow_neg
    FROM erp_van_sales_settings s WHERE s.company_id = v_company;
  v_allow_neg := COALESCE(v_allow_neg, false);

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN RAISE EXCEPTION 'no_valid_lines'; END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_pid  := NULLIF(v_line->>'product_id','')::uuid;
    v_qty  := COALESCE((v_line->>'quantity')::numeric, 0);
    v_disc := GREATEST(COALESCE((v_line->>'discount_pct')::numeric, 0), 0);
    IF v_pid IS NULL OR v_qty <= 0 THEN CONTINUE; END IF;
    IF v_cap IS NOT NULL AND v_disc > v_cap THEN RAISE EXCEPTION 'discount_exceeds_cap'; END IF;

    -- ── UoM resolution (additive; no uom ⇒ factor 1 ⇒ identical to legacy) ──
    v_uom := NULLIF(btrim(v_line->>'uom'), '');
    v_factor := CASE WHEN v_uom IS NULL THEN 1
                     ELSE COALESCE((SELECT u.factor FROM erp_product_uoms u
                                      WHERE u.product_id = v_pid AND u.uom = v_uom LIMIT 1), 1) END;
    v_baseqty := v_qty * v_factor;

    v_uomprice := NULL;
    IF v_uom IS NOT NULL AND v_factor <> 1 THEN
      SELECT pr.price INTO v_uomprice FROM erp_prices pr
        WHERE pr.product_id = v_pid AND pr.uom = v_uom AND pr.is_active
          AND pr.effective_from <= current_date AND (pr.effective_to IS NULL OR pr.effective_to >= current_date)
          AND pr.min_qty <= v_qty AND (pr.customer_id IS NULL OR pr.customer_id = p_customer_id)
        ORDER BY (pr.customer_id IS NOT NULL AND pr.customer_id = p_customer_id) DESC, pr.min_qty DESC
        LIMIT 1;
    END IF;
    IF v_uomprice IS NOT NULL THEN
      v_price := round(v_uomprice / v_factor, 6);           -- per-base price from the per-uom special
    ELSE
      SELECT rp.price INTO v_price
        FROM erp_resolve_price(v_pid, p_customer_id, p_branch_id, v_baseqty, current_date) rp;
      v_price := COALESCE(v_price, 0);
    END IF;

    SELECT pc.tax_rate INTO v_tax FROM erp_products_catalog pc WHERE pc.id = v_pid;
    v_tax := COALESCE(v_tax, 0);

    v_gross := round(v_baseqty * v_price, 2);
    v_ldisc := round(v_gross * v_disc / 100.0, 2);
    v_lnet  := v_gross - v_ldisc;
    v_ltax  := round(v_lnet * v_tax / 100.0, 2);

    v_total    := v_total + v_gross;
    v_discount := v_discount + v_ldisc;
    v_taxsum   := v_taxsum + v_ltax;
    v_nlines   := v_nlines + 1;
    v_priced   := v_priced || jsonb_build_object(
      'product_id', v_pid, 'quantity', v_baseqty, 'unit_price', v_price,
      'discount_pct', v_disc, 'line_total', v_lnet,
      'entered_uom', v_uom,
      'entered_qty', CASE WHEN v_uom IS NULL THEN NULL ELSE v_qty END,
      'uom_factor',  CASE WHEN v_uom IS NULL THEN NULL ELSE v_factor END);
  END LOOP;

  IF v_nlines = 0 THEN RAISE EXCEPTION 'no_valid_lines'; END IF;

  v_total    := round(v_total, 2);
  v_discount := round(v_discount, 2);
  v_taxsum   := round(v_taxsum, 2);
  v_net      := round(v_total - v_discount + v_taxsum, 2);

  IF COALESCE(v_credit_limit, 0) > 0 AND COALESCE(v_balance, 0) + v_net > v_credit_limit THEN
    RAISE EXCEPTION 'over_credit';
  END IF;

  IF NOT v_allow_neg THEN
    IF EXISTS (
      SELECT 1 FROM (
        SELECT (l->>'product_id')::uuid AS pid, SUM((l->>'quantity')::numeric) AS qty
          FROM jsonb_array_elements(v_priced) l GROUP BY 1
      ) req
      LEFT JOIN erp_inventory_stock s ON s.warehouse_id = v_wh AND s.product_id = req.pid
      WHERE req.qty > COALESCE(s.quantity, 0) - COALESCE(s.reserved_qty, 0)
    ) THEN
      RAISE EXCEPTION 'insufficient_van_stock';
    END IF;
  END IF;

  v_invno := erp_next_number(p_branch_id, 'invoice');
  INSERT INTO erp_invoices(branch_id, customer_id, invoice_number, idempotency_key,
                           status, total_amount, discount_amount, tax_amount, net_amount,
                           due_date, notes, created_by)
  VALUES (p_branch_id, p_customer_id, v_invno, p_idempotency_key,
          'draft', v_total, v_discount, v_taxsum, v_net,
          p_due_date, NULLIF(btrim(COALESCE(p_notes, '')), ''), v_uid)
  RETURNING id INTO v_invid;

  INSERT INTO erp_invoice_lines(invoice_id, product_id, quantity, unit_price, discount_pct, line_total,
                                entered_uom, entered_qty, uom_factor)
  SELECT v_invid, (l->>'product_id')::uuid, (l->>'quantity')::numeric,
         (l->>'unit_price')::numeric, (l->>'discount_pct')::numeric, (l->>'line_total')::numeric,
         NULLIF(l->>'entered_uom',''), NULLIF(l->>'entered_qty','')::numeric, NULLIF(l->>'uom_factor','')::numeric
    FROM jsonb_array_elements(v_priced) l;

  PERFORM erp_issue_invoice(v_invid);

  invoice_id := v_invid; invoice_number := v_invno; net_amount := v_net;
  RETURN NEXT; RETURN;
END $function$;
