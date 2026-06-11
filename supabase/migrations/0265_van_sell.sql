-- ============================================================================
-- 0265: Van Sell — atomic field sale off the van (create + issue in one tx)
-- ----------------------------------------------------------------------------
-- The field rep sells directly from their van. erp_van_sell() is the single
-- authority for a van sale: one SECURITY DEFINER function = one transaction.
-- It layers van-specific guarantees on top of the existing, tested invoice path
-- (insert draft → erp_issue_invoice), WITHOUT changing any existing flow:
--
--   * Server-side pricing      — the unit price of every line comes from
--                                erp_resolve_price; the caller never supplies a
--                                price (no client-side price tampering).
--   * Van is required          — stock is taken ONLY from the rep's own active
--                                van in the branch; if the rep has no van the
--                                sale is rejected (no silent branch fallback).
--   * Discount cap             — per-line discount_pct may not exceed the
--                                company's erp_van_sales_settings.discount_cap_pct
--                                (NULL = uncapped).
--   * Credit limit             — balance + net may not exceed the customer's
--                                credit_limit (0 / NULL = unlimited).
--   * Negative-stock guard     — unless allow_negative_van_stock, every line's
--                                quantity must be available at the van.
--   * Idempotency              — a repeat idempotency_key returns the existing
--                                sale instead of creating a duplicate.
--
-- erp_issue_invoice (0013) then posts the sale_out at the same van, raises the
-- customer balance, and fires the AR/Revenue journal on the status→issued
-- transition. Totals follow sales-calc exactly (net = gross − discount + tax).
--
-- ADDITIVE: new function only. createInvoice / issueInvoice / erp_issue_invoice
-- are untouched, so desktop invoicing is unchanged. Inert until a tenant turns
-- on Van Sales (KAKO_VAN_SALES + per-company erp_van_sales_settings). Safe to
-- re-run. Rollback: DROP FUNCTION erp_van_sell(uuid,uuid,jsonb,uuid,date,text);
-- ============================================================================

CREATE OR REPLACE FUNCTION erp_van_sell(
  p_branch_id        uuid,
  p_customer_id      uuid,
  p_lines            jsonb,
  p_idempotency_key  uuid DEFAULT NULL,
  p_due_date         date DEFAULT NULL,
  p_notes            text DEFAULT NULL
)
RETURNS TABLE(invoice_id uuid, invoice_number text, net_amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_company      uuid;
  v_is_approved  boolean;
  v_credit_limit numeric;
  v_balance      numeric;
  v_wh           uuid;
  v_cap          numeric;
  v_allow_neg    boolean := false;
  v_line         jsonb;
  v_pid          uuid;
  v_qty          numeric;
  v_disc         numeric;
  v_price        numeric;
  v_tax          numeric;
  v_gross        numeric;
  v_ldisc        numeric;
  v_lnet         numeric;
  v_ltax         numeric;
  v_total        numeric := 0;
  v_discount     numeric := 0;
  v_taxsum       numeric := 0;
  v_net          numeric;
  v_nlines       int := 0;
  v_priced       jsonb := '[]'::jsonb;
  v_invid        uuid;
  v_invno        text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT erp_has_branch_access(p_branch_id) THEN RAISE EXCEPTION 'branch_access_denied'; END IF;

  SELECT b.company_id INTO v_company FROM erp_branches b WHERE b.id = p_branch_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'branch_not_found'; END IF;

  -- Idempotency: a repeat key returns the already-created sale (no double sale).
  IF p_idempotency_key IS NOT NULL THEN
    SELECT i.id, i.invoice_number, i.net_amount INTO v_invid, v_invno, v_net
      FROM erp_invoices i WHERE i.idempotency_key = p_idempotency_key;
    IF FOUND THEN
      invoice_id := v_invid; invoice_number := v_invno; net_amount := v_net;
      RETURN NEXT; RETURN;
    END IF;
  END IF;

  -- Customer must exist in this company and be approved.
  SELECT c.is_approved, c.credit_limit, c.balance
    INTO v_is_approved, v_credit_limit, v_balance
    FROM erp_customers c WHERE c.id = p_customer_id AND c.company_id = v_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer_not_found'; END IF;
  IF v_is_approved IS FALSE THEN RAISE EXCEPTION 'customer_not_approved'; END IF;

  -- Van is REQUIRED: the rep's own active van in this branch. No branch fallback.
  SELECT w.id INTO v_wh FROM erp_warehouses w
   WHERE w.branch_id = p_branch_id AND w.is_active AND w.is_van AND w.assigned_to = v_uid
   ORDER BY w.code LIMIT 1;
  IF v_wh IS NULL THEN RAISE EXCEPTION 'no_van_assigned'; END IF;

  -- Policy (safe defaults when no settings row exists). When the SELECT finds no
  -- row, INTO leaves the variables NULL — so coerce allow_negative back to false
  -- (a NULL would make `NOT v_allow_neg` NULL and silently skip the stock guard).
  -- A NULL cap is intentional: it means "uncapped".
  SELECT s.discount_cap_pct, s.allow_negative_van_stock
    INTO v_cap, v_allow_neg
    FROM erp_van_sales_settings s WHERE s.company_id = v_company;
  v_allow_neg := COALESCE(v_allow_neg, false);

  -- Price every line server-side, enforce the discount cap, accumulate totals.
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN RAISE EXCEPTION 'no_valid_lines'; END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_pid  := NULLIF(v_line->>'product_id','')::uuid;
    v_qty  := COALESCE((v_line->>'quantity')::numeric, 0);
    v_disc := GREATEST(COALESCE((v_line->>'discount_pct')::numeric, 0), 0);
    IF v_pid IS NULL OR v_qty <= 0 THEN CONTINUE; END IF;  -- skip empties (mirrors normalizeVanSellLines)
    IF v_cap IS NOT NULL AND v_disc > v_cap THEN RAISE EXCEPTION 'discount_exceeds_cap'; END IF;

    SELECT rp.price INTO v_price
      FROM erp_resolve_price(v_pid, p_customer_id, p_branch_id, v_qty, current_date) rp;
    v_price := COALESCE(v_price, 0);
    SELECT pc.tax_rate INTO v_tax FROM erp_products_catalog pc WHERE pc.id = v_pid;
    v_tax := COALESCE(v_tax, 0);

    -- Line math, rounded per line — identical to sales-calc.computeLine.
    v_gross := round(v_qty * v_price, 2);
    v_ldisc := round(v_gross * v_disc / 100.0, 2);
    v_lnet  := v_gross - v_ldisc;
    v_ltax  := round(v_lnet * v_tax / 100.0, 2);

    v_total    := v_total + v_gross;
    v_discount := v_discount + v_ldisc;
    v_taxsum   := v_taxsum + v_ltax;
    v_nlines   := v_nlines + 1;
    v_priced   := v_priced || jsonb_build_object(
      'product_id', v_pid, 'quantity', v_qty, 'unit_price', v_price,
      'discount_pct', v_disc, 'line_total', v_lnet);
  END LOOP;

  IF v_nlines = 0 THEN RAISE EXCEPTION 'no_valid_lines'; END IF;

  v_total    := round(v_total, 2);
  v_discount := round(v_discount, 2);
  v_taxsum   := round(v_taxsum, 2);
  v_net      := round(v_total - v_discount + v_taxsum, 2);

  -- Credit limit (0 / NULL = unlimited).
  IF COALESCE(v_credit_limit, 0) > 0 AND COALESCE(v_balance, 0) + v_net > v_credit_limit THEN
    RAISE EXCEPTION 'over_credit';
  END IF;

  -- Negative-stock guard at the van (unless policy allows). Missing row = 0 avail.
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

  -- Create the invoice (draft) + lines, then issue. erp_issue_invoice posts the
  -- sale_out at the rep's van (assigned_to = created_by = v_uid), raises the
  -- balance, and fires the AR/Revenue journal on the status→issued transition.
  v_invno := erp_next_number(p_branch_id, 'invoice');
  INSERT INTO erp_invoices(branch_id, customer_id, invoice_number, idempotency_key,
                           status, total_amount, discount_amount, tax_amount, net_amount,
                           due_date, notes, created_by)
  VALUES (p_branch_id, p_customer_id, v_invno, p_idempotency_key,
          'draft', v_total, v_discount, v_taxsum, v_net,
          p_due_date, NULLIF(btrim(COALESCE(p_notes, '')), ''), v_uid)
  RETURNING id INTO v_invid;

  INSERT INTO erp_invoice_lines(invoice_id, product_id, quantity, unit_price, discount_pct, line_total)
  SELECT v_invid, (l->>'product_id')::uuid, (l->>'quantity')::numeric,
         (l->>'unit_price')::numeric, (l->>'discount_pct')::numeric, (l->>'line_total')::numeric
    FROM jsonb_array_elements(v_priced) l;

  PERFORM erp_issue_invoice(v_invid);

  invoice_id := v_invid; invoice_number := v_invno; net_amount := v_net;
  RETURN NEXT; RETURN;
END $$;

REVOKE EXECUTE ON FUNCTION public.erp_van_sell(uuid, uuid, jsonb, uuid, date, text) FROM anon;
