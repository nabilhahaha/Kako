-- ============================================================================
-- 0306: Collection-in-Sell — erp_van_sell_with_payment (atomic sell + tenders)
-- ----------------------------------------------------------------------------
-- Phase 1 of "payment before invoice issuance": one atomic RPC that issues the
-- van invoice (the ENTIRE validated erp_van_sell body — auth, branch,
-- idempotency, customer/credit, van, discount cap, stock guard, UoM, invoice +
-- issue) and THEN applies 0..N payment tenders against that new invoice, setting
-- paid_amount + status, before returning. The rep leaves the customer with the
-- invoice AND the final payment status settled in a single transaction.
--
-- Reuses the EXISTING collections engine verbatim (erp_collections /
-- erp_collection_allocations from 0192/0267): each tender becomes one standard
-- collection row (single method) allocated to the new invoice, the invoice
-- paid_amount/status is set exactly as erp_settle_collection does, and the
-- customer AR balance is lowered by the total applied. So every existing report,
-- statement and reconciliation query keeps working unchanged.
--
-- Payment scenarios (all expressible via p_tenders):
--   • Full cash    — one tender, amount = net            ⇒ status 'paid'
--   • Full credit  — zero tenders                        ⇒ status 'issued' (credit)
--   • Partial      — tenders sum < net                   ⇒ status 'partially_paid'
--   • Mixed        — N tenders (cash/card/transfer/cheque) ⇒ paid/partial by sum
-- No overpayment in-sell: Σ tenders may not exceed net (raises
-- 'payment_exceeds_total'); change / on-account credit is out of Phase-1 scope.
--
-- ADDITIVE & REVERSIBLE: brand-new function; erp_van_sell, erp_settle_collection
-- and the standalone Collect screen are untouched. App calls this only when the
-- platform.collect_in_sell flag is ON, so it is flag-gated end-to-end. Idempotent
-- via the invoice idempotency_key (a repeat key returns the existing invoice +
-- its current paid_amount/status WITHOUT re-applying tenders).
--
-- Rollback: DROP FUNCTION erp_van_sell_with_payment(...);  (no schema change,
--           no data transform — invoices/collections created remain valid).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.erp_van_sell_with_payment(
  p_branch_id uuid, p_customer_id uuid, p_lines jsonb,
  p_tenders jsonb DEFAULT NULL::jsonb,
  p_idempotency_key uuid DEFAULT NULL::uuid, p_due_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(invoice_id uuid, invoice_number text, net_amount numeric, paid_amount numeric, status text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_company uuid; v_is_approved boolean; v_credit_limit numeric;
  v_balance numeric; v_wh uuid; v_cap numeric; v_allow_neg boolean := false;
  v_terms int; v_cc_enabled boolean; v_overdue_days int;
  v_line jsonb; v_pid uuid; v_qty numeric; v_disc numeric; v_price numeric; v_tax numeric;
  v_gross numeric; v_ldisc numeric; v_lnet numeric; v_ltax numeric;
  v_total numeric := 0; v_discount numeric := 0; v_taxsum numeric := 0; v_net numeric;
  v_nlines int := 0; v_priced jsonb := '[]'::jsonb; v_invid uuid; v_invno text;
  v_uom text; v_factor numeric; v_baseqty numeric; v_uomprice numeric;
  -- tender (collection-in-sell) locals
  v_tender jsonb; v_tmethod text; v_tamount numeric; v_tref text;
  v_paid numeric := 0; v_remain numeric; v_colid uuid; v_colno text; v_status text;
  v_pay_total numeric := 0; v_unpaid numeric; v_avail numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT erp_has_branch_access(p_branch_id) THEN RAISE EXCEPTION 'branch_access_denied'; END IF;

  SELECT b.company_id INTO v_company FROM erp_branches b WHERE b.id = p_branch_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'branch_not_found'; END IF;

  -- Idempotency: a repeat key returns the existing invoice + its CURRENT payment
  -- state, without re-issuing or re-applying any tender.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT i.id, i.invoice_number, i.net_amount, i.paid_amount, i.status::text
      INTO v_invid, v_invno, v_net, v_paid, v_status
      FROM erp_invoices i WHERE i.idempotency_key = p_idempotency_key;
    IF FOUND THEN
      invoice_id := v_invid; invoice_number := v_invno; net_amount := v_net;
      paid_amount := v_paid; status := v_status;
      RETURN NEXT; RETURN;
    END IF;
  END IF;

  SELECT c.is_approved, c.credit_limit, c.balance, c.payment_terms_days, c.credit_control_enabled
    INTO v_is_approved, v_credit_limit, v_balance, v_terms, v_cc_enabled
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

  -- ── Credit-limit validation (authoritative; accounts for payment) ──────────
  -- Total tendered up-front so we can size the AR (unpaid) portion this sale
  -- creates, then enforce the customer's credit ceiling BEFORE issuing:
  --   • Σ tenders may not exceed the net (no overpayment).
  --   • credit_limit = 0  ⇒ the sale must be fully paid (no new AR allowed).
  --   • credit_limit > 0  ⇒ unpaid ≤ available = credit_limit − current balance.
  -- The salesman cannot override this (a future supervisor override is out of
  -- Phase-1 scope).
  v_pay_total := COALESCE((
    SELECT round(SUM(GREATEST(COALESCE((e->>'amount')::numeric, 0), 0)), 2)
      FROM jsonb_array_elements(COALESCE(p_tenders, '[]'::jsonb)) e
  ), 0);
  IF v_pay_total > v_net THEN RAISE EXCEPTION 'payment_exceeds_total'; END IF;

  v_unpaid := round(v_net - v_pay_total, 2);   -- the AR this invoice would create

  -- Credit-days / overdue block: if credit control is on, a terms window is set,
  -- and the customer's OLDEST unpaid invoice is older than that window, no new
  -- credit may be created — only a fully-paid (cash) sale is allowed. Collection
  -- against existing debt stays available via the standalone Collect screen.
  IF v_unpaid > 0 AND COALESCE(v_cc_enabled, true) AND COALESCE(v_terms, 0) > 0 THEN
    SELECT (current_date - MIN(i.created_at::date))::int INTO v_overdue_days
      FROM erp_invoices i
     WHERE i.customer_id = p_customer_id
       AND i.status IN ('issued', 'partially_paid', 'overdue')
       AND (i.net_amount - i.paid_amount) > 0;
    IF v_overdue_days IS NOT NULL AND v_overdue_days > v_terms THEN
      RAISE EXCEPTION 'customer_overdue_blocked';
    END IF;
  END IF;

  -- Credit-limit block (accounts for payment): limit 0 ⇒ must be fully paid;
  -- limit > 0 ⇒ unpaid ≤ available (= limit − balance; ≤ 0 once balance ≥ limit).
  IF COALESCE(v_credit_limit, 0) <= 0 THEN
    IF v_unpaid > 0 THEN RAISE EXCEPTION 'over_credit'; END IF;
  ELSE
    v_avail := round(v_credit_limit - COALESCE(v_balance, 0), 2);
    IF v_unpaid > v_avail THEN RAISE EXCEPTION 'over_credit'; END IF;
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

  -- ── Collection-in-Sell: apply the tenders to THIS invoice BEFORE issuing.
  --    Reusing the exact erp_settle_collection posting (one collection row per
  --    tender, allocated to the invoice; invoice.paid_amount set; customer AR
  --    lowered). Doing it BEFORE erp_issue_invoice means that function's own
  --    credit check sees the TRUE post-payment exposure (balance + unpaid),
  --    not the full net — so a partial sale that fits within available credit is
  --    not falsely blocked. The invoice stays 'draft' (paid_amount only) so issue
  --    accepts it. Reset v_paid first (a non-matching idempotency SELECT…INTO
  --    above nulls it). ──────────────────────────────────────────────────────
  v_paid := 0;
  IF p_tenders IS NOT NULL AND jsonb_typeof(p_tenders) = 'array' THEN
    FOR v_tender IN SELECT value FROM jsonb_array_elements(p_tenders) LOOP
      v_tmethod := NULLIF(btrim(v_tender->>'method'), '');
      v_tamount := round(COALESCE((v_tender->>'amount')::numeric, 0), 2);
      v_tref    := NULLIF(btrim(v_tender->>'reference'), '');
      IF v_tmethod IS NULL THEN v_tmethod := 'cash'; END IF;
      IF v_tamount <= 0 THEN CONTINUE; END IF;

      -- No overpayment in-sell: a tender may not push paid beyond the net.
      v_remain := round(v_net - v_paid, 2);
      IF v_tamount > v_remain THEN RAISE EXCEPTION 'payment_exceeds_total'; END IF;

      v_colno := erp_next_number(p_branch_id, 'collection');
      INSERT INTO erp_collections(branch_id, customer_id, collection_number, collection_date, method,
                                  reference_number, amount, applied_amount, unapplied_amount, status, received_by)
      VALUES (p_branch_id, p_customer_id, v_colno, CURRENT_DATE, v_tmethod,
              v_tref, v_tamount, v_tamount, 0, 'settled', v_uid)
      RETURNING id INTO v_colid;

      INSERT INTO erp_collection_allocations(collection_id, invoice_id, applied_amount)
      VALUES (v_colid, v_invid, v_tamount);

      v_paid := round(v_paid + v_tamount, 2);
    END LOOP;

    IF v_paid > 0 THEN
      UPDATE erp_invoices SET paid_amount = v_paid WHERE id = v_invid;  -- keep status 'draft'
      UPDATE erp_customers SET balance = balance - v_paid WHERE id = p_customer_id;
    END IF;
  END IF;

  -- Issue: posts stock (sale_out), sets status 'issued', adds net to AR. Its own
  -- credit check now evaluates (balance − paid) + net = balance + unpaid.
  PERFORM erp_issue_invoice(v_invid);

  -- erp_issue_invoice forces status 'issued'; reflect the real payment state.
  IF v_paid > 0 THEN
    UPDATE erp_invoices
       SET status = (CASE WHEN v_paid >= v_net THEN 'paid' ELSE 'partially_paid' END)::erp_invoice_status
     WHERE id = v_invid;
  END IF;

  SELECT i.status::text INTO v_status FROM erp_invoices i WHERE i.id = v_invid;

  invoice_id := v_invid; invoice_number := v_invno; net_amount := v_net;
  paid_amount := v_paid; status := v_status;
  RETURN NEXT; RETURN;
END $function$;

REVOKE EXECUTE ON FUNCTION public.erp_van_sell_with_payment(uuid, uuid, jsonb, jsonb, uuid, date, text) FROM anon;
