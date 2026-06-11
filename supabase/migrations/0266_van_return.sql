-- ============================================================================
-- 0266: Van Return — atomic field return back to the rep's van
-- ----------------------------------------------------------------------------
-- The field rep accepts a return at the customer; the goods go back to the rep's
-- OWN van (not the branch warehouse). erp_van_return() is the single authority:
-- one SECURITY DEFINER transaction that mirrors erp_complete_sales_return but
-- restocks the VAN, with van-specific guarantees:
--
--   * Return-to-van            — return_in posts ONLY to the rep's active van; if
--                                the rep has no van the return is rejected.
--   * Mandatory reason         — p_reason_id is required and must be an active
--                                reason in the company's erp_return_reasons.
--   * Server-side pricing      — unit price comes from the ORIGINAL invoice line
--                                (when p_invoice_id is given) else erp_resolve_price;
--                                the caller never supplies a price.
--   * Credit-note linkage      — optional erp_credit_notes row (CN-<return_number>),
--                                linked to the return + original invoice, traceable.
--   * Full audit               — erp_log_audit captures who / when / reason / qty /
--                                original invoice; the return row itself records
--                                created_by, created_at, reason_id, invoice_id.
--   * Idempotency              — a repeat idempotency_key returns the existing
--                                return (no double restock / double credit).
--
-- Adds erp_sales_returns.idempotency_key (additive, nullable + partial unique).
-- erp_complete_sales_return / createReturn are untouched. Inert until a tenant
-- turns on Van Sales. Safe to re-run.
-- Rollback: DROP FUNCTION erp_van_return(uuid,uuid,jsonb,uuid,uuid,boolean,text,uuid);
--           ALTER TABLE erp_sales_returns DROP COLUMN idempotency_key;
-- ============================================================================

ALTER TABLE erp_sales_returns ADD COLUMN IF NOT EXISTS idempotency_key uuid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_sales_returns_idem
  ON erp_sales_returns (idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION erp_van_return(
  p_branch_id         uuid,
  p_customer_id       uuid,
  p_lines             jsonb,                  -- [{product_id, quantity}]
  p_reason_id         uuid,                   -- MANDATORY (erp_return_reasons)
  p_invoice_id        uuid    DEFAULT NULL,   -- original invoice (price + trace)
  p_create_credit_note boolean DEFAULT false,
  p_notes             text    DEFAULT NULL,
  p_idempotency_key   uuid    DEFAULT NULL
)
RETURNS TABLE(return_id uuid, return_number text, credit_note_id uuid, total_amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_company   uuid;
  v_wh        uuid;
  v_line      jsonb;
  v_pid       uuid;
  v_qty       numeric;
  v_price     numeric;
  v_total     numeric := 0;
  v_nlines    int := 0;
  v_priced    jsonb := '[]'::jsonb;
  v_retid     uuid;
  v_retno     text;
  v_cnid      uuid;
  v_cnno      text;
  v_sr_acc    uuid;
  v_ar_acc    uuid;
  v_entry_id  uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT erp_has_branch_access(p_branch_id) THEN RAISE EXCEPTION 'branch_access_denied'; END IF;

  SELECT b.company_id INTO v_company FROM erp_branches b WHERE b.id = p_branch_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'branch_not_found'; END IF;

  -- Idempotency: a repeat key returns the already-created return.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT r.id, r.return_number, r.total_amount INTO v_retid, v_retno, v_total
      FROM erp_sales_returns r WHERE r.idempotency_key = p_idempotency_key;
    IF FOUND THEN
      SELECT cn.id INTO v_cnid FROM erp_credit_notes cn WHERE cn.return_id = v_retid LIMIT 1;
      return_id := v_retid; return_number := v_retno; credit_note_id := v_cnid; total_amount := v_total;
      RETURN NEXT; RETURN;
    END IF;
  END IF;

  -- Reset accumulators: a no-match idempotency lookup above NULLs them via
  -- SELECT INTO, which would poison the totals below.
  v_total := 0; v_nlines := 0; v_priced := '[]'::jsonb; v_retid := NULL; v_retno := NULL; v_cnid := NULL;

  -- Reason is MANDATORY and must be an active reason in THIS company.
  IF p_reason_id IS NULL THEN RAISE EXCEPTION 'reason_required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM erp_return_reasons rr
     WHERE rr.id = p_reason_id AND rr.company_id = v_company AND rr.is_active
  ) THEN RAISE EXCEPTION 'invalid_reason'; END IF;

  -- Customer must belong to this company.
  IF NOT EXISTS (SELECT 1 FROM erp_customers c WHERE c.id = p_customer_id AND c.company_id = v_company) THEN
    RAISE EXCEPTION 'customer_not_found';
  END IF;

  -- Return goes to the rep's OWN active van in this branch — no branch fallback.
  SELECT w.id INTO v_wh FROM erp_warehouses w
   WHERE w.branch_id = p_branch_id AND w.is_active AND w.is_van AND w.assigned_to = v_uid
   ORDER BY w.code LIMIT 1;
  IF v_wh IS NULL THEN RAISE EXCEPTION 'no_van_assigned'; END IF;

  -- If an original invoice is referenced, it must belong to this customer + branch.
  IF p_invoice_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM erp_invoices i
       WHERE i.id = p_invoice_id AND i.customer_id = p_customer_id AND i.branch_id = p_branch_id
    ) THEN RAISE EXCEPTION 'invoice_mismatch'; END IF;
  END IF;

  -- Price every line server-side. Original invoice line price (credits what was
  -- charged) when available, else the resolved current price. Never a client price.
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN RAISE EXCEPTION 'no_valid_lines'; END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_pid := NULLIF(v_line->>'product_id','')::uuid;
    v_qty := COALESCE((v_line->>'quantity')::numeric, 0);
    IF v_pid IS NULL OR v_qty <= 0 THEN CONTINUE; END IF;

    v_price := NULL;
    IF p_invoice_id IS NOT NULL THEN
      SELECT il.unit_price INTO v_price
        FROM erp_invoice_lines il WHERE il.invoice_id = p_invoice_id AND il.product_id = v_pid
        ORDER BY il.unit_price DESC LIMIT 1;
    END IF;
    IF v_price IS NULL THEN
      SELECT rp.price INTO v_price FROM erp_resolve_price(v_pid, p_customer_id, p_branch_id, v_qty, current_date) rp;
    END IF;
    v_price := COALESCE(v_price, 0);

    v_total  := v_total + round(v_qty * v_price, 2);
    v_nlines := v_nlines + 1;
    v_priced := v_priced || jsonb_build_object('product_id', v_pid, 'quantity', v_qty, 'unit_price', v_price, 'line_total', round(v_qty * v_price, 2));
  END LOOP;
  IF v_nlines = 0 THEN RAISE EXCEPTION 'no_valid_lines'; END IF;
  v_total := round(v_total, 2);

  -- Header (completed immediately — a field return restocks the van now).
  v_retno := erp_next_number(p_branch_id, 'return');
  INSERT INTO erp_sales_returns(branch_id, customer_id, invoice_id, return_number, status,
                                total_amount, reason_id, notes, created_by, approved_by, idempotency_key)
  VALUES (p_branch_id, p_customer_id, p_invoice_id, v_retno, 'completed',
          v_total, p_reason_id, NULLIF(btrim(COALESCE(p_notes,'')),''), v_uid, v_uid, p_idempotency_key)
  RETURNING id INTO v_retid;

  INSERT INTO erp_sales_return_lines(return_id, product_id, quantity, unit_price, line_total)
  SELECT v_retid, (l->>'product_id')::uuid, (l->>'quantity')::numeric, (l->>'unit_price')::numeric, (l->>'line_total')::numeric
    FROM jsonb_array_elements(v_priced) l;

  -- Stock back to the VAN (server-authoritative).
  INSERT INTO erp_stock_movements(movement_type, warehouse_id, product_id, quantity, reference_type, reference_id, notes, created_by)
  SELECT 'return_in', v_wh, (l->>'product_id')::uuid, abs((l->>'quantity')::numeric), 'sales_return', v_retid, 'مرتجع شاحنة: ' || v_retno, v_uid
    FROM jsonb_array_elements(v_priced) l;

  -- Sales-Returns / AR journal (when the system accounts exist).
  IF v_total > 0 THEN
    SELECT id INTO v_sr_acc FROM erp_chart_of_accounts WHERE code = '4110' AND is_system = true;
    SELECT id INTO v_ar_acc FROM erp_chart_of_accounts WHERE code = '1200' AND is_system = true;
    IF v_sr_acc IS NOT NULL AND v_ar_acc IS NOT NULL THEN
      INSERT INTO erp_journal_entries(entry_number, description, reference_type, reference_id, branch_id, status, created_by, posted_by, posted_at)
      VALUES (erp_next_number(p_branch_id, 'journal'), 'مرتجع شاحنة ' || v_retno, 'sales_return', v_retid, p_branch_id, 'posted', v_uid, v_uid, now())
      RETURNING id INTO v_entry_id;
      INSERT INTO erp_journal_lines(journal_entry_id, account_id, debit, credit, description) VALUES
        (v_entry_id, v_sr_acc, v_total, 0, 'مرتجع ' || v_retno),
        (v_entry_id, v_ar_acc, 0, v_total, 'مرتجع ' || v_retno);
    END IF;
  END IF;

  -- Lower the customer's outstanding balance by the credited total.
  UPDATE erp_customers SET balance = balance - v_total WHERE id = p_customer_id;

  -- Optional credit note, linked to the return + original invoice (traceable).
  IF p_create_credit_note THEN
    v_cnno := 'CN-' || v_retno;
    INSERT INTO erp_credit_notes(company_id, return_id, invoice_id, credit_note_number, amount, status)
    VALUES (v_company, v_retid, p_invoice_id, v_cnno, v_total, 'issued')
    RETURNING id INTO v_cnid;
  END IF;

  -- Audit: who / when (now) / reason / qty (line count) / original invoice.
  PERFORM erp_log_audit('van_return.complete', 'sales_return', v_retid::text,
    jsonb_build_object('return_number', v_retno, 'reason_id', p_reason_id, 'invoice_id', p_invoice_id,
                       'total', v_total, 'lines', v_nlines, 'van_warehouse', v_wh,
                       'credit_note_id', v_cnid),
    v_company);

  return_id := v_retid; return_number := v_retno; credit_note_id := v_cnid; total_amount := v_total;
  RETURN NEXT; RETURN;
END $$;

REVOKE EXECUTE ON FUNCTION public.erp_van_return(uuid, uuid, jsonb, uuid, uuid, boolean, text, uuid) FROM anon;
