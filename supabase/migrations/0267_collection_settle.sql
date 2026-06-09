-- ============================================================================
-- 0267: Collections — multi-invoice settlement (entry + allocation), atomic
-- ----------------------------------------------------------------------------
-- Completes the FMCG sell → invoice → COLLECT loop. Reuses the existing
-- collections engine (erp_collections / erp_collection_allocations, 0192) and the
-- pure allocatePayment policy (oldest-first / specified); adds ONE atomic
-- SECURITY DEFINER commit so a single field receipt settles many invoices with
-- guaranteed consistency:
--
--   * Concurrency-safe   — outstanding invoices are locked FOR UPDATE and the
--                          applied amount is re-clamped to the live remaining, so
--                          two settlements can never over-apply an invoice.
--   * Balance-consistent  — erp_customers.balance is lowered by the total APPLIED
--                          (matches erp_record_payment); the on-account remainder
--                          is recorded as unapplied, never silently lost.
--   * Idempotent          — a repeat idempotency_key returns the existing receipt.
--   * Numbered            — collection_number = COL-<branch>-NNNNNN.
--
-- P4 numbering: erp_next_number already produced COL via its ELSE branch; make it
-- explicit for stability. ADDITIVE: new function + nullable column; the existing
-- settleCollection service / gateway are untouched. Inert until a tenant turns on
-- Van Sales. Safe to re-run.
-- Rollback: DROP FUNCTION erp_settle_collection(...); ALTER TABLE erp_collections
--           DROP COLUMN idempotency_key;
-- ============================================================================

-- ── P4: explicit COL prefix for collection numbers ──────────────────────────
CREATE OR REPLACE FUNCTION erp_next_number(p_branch_id UUID, p_seq_type TEXT)
RETURNS TEXT AS $$
DECLARE
  v_prefix TEXT; v_branch_code TEXT; v_next BIGINT; v_result TEXT;
BEGIN
  SELECT code INTO v_branch_code FROM erp_branches WHERE id = p_branch_id;
  IF v_branch_code IS NULL THEN RAISE EXCEPTION 'Branch not found: %', p_branch_id; END IF;

  INSERT INTO erp_sequences (branch_id, seq_type, prefix, current_val)
  VALUES (
    p_branch_id, p_seq_type,
    CASE p_seq_type
      WHEN 'invoice'          THEN 'INV'
      WHEN 'sales_order'      THEN 'SO'
      WHEN 'purchase_order'   THEN 'PO'
      WHEN 'journal'          THEN 'JV'
      WHEN 'transfer'         THEN 'TR'
      WHEN 'goods_receipt'    THEN 'GR'
      WHEN 'return'           THEN 'RET'
      WHEN 'payment_voucher'  THEN 'PV'
      WHEN 'receipt_voucher'  THEN 'RV'
      WHEN 'collection'       THEN 'COL'
      ELSE UPPER(LEFT(p_seq_type, 3))
    END,
    1
  )
  ON CONFLICT (branch_id, seq_type) DO UPDATE
    SET current_val = erp_sequences.current_val + 1
  RETURNING prefix, current_val INTO v_prefix, v_next;

  v_result := v_prefix || '-' || v_branch_code || '-' || LPAD(v_next::TEXT, 6, '0');
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ── Idempotency on the collection receipt (additive) ────────────────────────
ALTER TABLE erp_collections ADD COLUMN IF NOT EXISTS idempotency_key uuid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_collections_idem
  ON erp_collections (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ── Atomic multi-invoice settlement ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION erp_settle_collection(
  p_branch_id       uuid,
  p_customer_id     uuid,
  p_amount          numeric,
  p_method          text    DEFAULT 'cash',
  p_reference       text    DEFAULT NULL,
  p_specified       jsonb   DEFAULT NULL,   -- {invoice_id: amount, ...} else oldest-first
  p_idempotency_key uuid    DEFAULT NULL,
  p_collection_date date    DEFAULT NULL
)
RETURNS TABLE(collection_id uuid, collection_number text, total_applied numeric, unapplied numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_budget  numeric;
  v_applied numeric := 0;
  v_inv     RECORD;
  v_take    numeric;
  v_remain  numeric;
  v_colid   uuid;
  v_colno   text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT erp_has_branch_access(p_branch_id) THEN RAISE EXCEPTION 'branch_access_denied'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  SELECT b.company_id INTO v_company FROM erp_branches b WHERE b.id = p_branch_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'branch_not_found'; END IF;

  -- Idempotency: a repeat key returns the already-created receipt.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT c.id, c.collection_number, c.applied_amount, c.unapplied_amount
      INTO v_colid, v_colno, v_applied, v_budget
      FROM erp_collections c WHERE c.idempotency_key = p_idempotency_key;
    IF FOUND THEN
      collection_id := v_colid; collection_number := v_colno; total_applied := v_applied; unapplied := v_budget;
      RETURN NEXT; RETURN;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM erp_customers c WHERE c.id = p_customer_id AND c.company_id = v_company) THEN
    RAISE EXCEPTION 'customer_not_found';
  END IF;

  v_applied := 0;
  v_budget  := round(p_amount, 2);

  -- Create the receipt header up-front (so allocations can FK to it).
  v_colno := erp_next_number(p_branch_id, 'collection');
  INSERT INTO erp_collections(branch_id, customer_id, collection_number, collection_date, method,
                              reference_number, amount, applied_amount, unapplied_amount, status, received_by, idempotency_key)
  VALUES (p_branch_id, p_customer_id, v_colno, COALESCE(p_collection_date, CURRENT_DATE), p_method,
          NULLIF(btrim(COALESCE(p_reference,'')),''), round(p_amount,2), 0, 0, 'settled', v_uid, p_idempotency_key)
  RETURNING id INTO v_colid;

  -- Walk this customer's outstanding invoices oldest-first, LOCKED. Apply either
  -- the specified amount or (oldest-first) the remaining budget, re-clamped to the
  -- live remaining so we can never over-apply.
  FOR v_inv IN
    SELECT i.id, i.net_amount, i.paid_amount
      FROM erp_invoices i
     WHERE i.customer_id = p_customer_id AND i.branch_id = p_branch_id
       AND i.status IN ('issued', 'partially_paid', 'overdue')
       AND (i.net_amount - i.paid_amount) > 0
     ORDER BY COALESCE(i.due_date, i.created_at::date) ASC, i.id ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_budget <= 0;
    v_remain := round(v_inv.net_amount - v_inv.paid_amount, 2);
    IF v_remain <= 0 THEN CONTINUE; END IF;

    IF p_specified IS NOT NULL THEN
      -- Specified: only invoices named in the map, clamped to remaining + budget.
      IF NOT (p_specified ? v_inv.id::text) THEN CONTINUE; END IF;
      v_take := round(LEAST((p_specified ->> v_inv.id::text)::numeric, v_remain, v_budget), 2);
    ELSE
      v_take := round(LEAST(v_remain, v_budget), 2);
    END IF;
    IF v_take <= 0 THEN CONTINUE; END IF;

    INSERT INTO erp_collection_allocations(collection_id, invoice_id, applied_amount)
    VALUES (v_colid, v_inv.id, v_take);

    UPDATE erp_invoices
       SET paid_amount = paid_amount + v_take,
           status = (CASE WHEN paid_amount + v_take >= net_amount THEN 'paid' ELSE 'partially_paid' END)::erp_invoice_status
     WHERE id = v_inv.id;

    v_applied := round(v_applied + v_take, 2);
    v_budget  := round(v_budget - v_take, 2);
  END LOOP;

  -- Finalise totals + lower the customer's outstanding AR by what was applied
  -- (the on-account remainder is recorded as unapplied, not applied to balance).
  UPDATE erp_collections
     SET applied_amount = v_applied, unapplied_amount = round(p_amount - v_applied, 2), updated_at = now()
   WHERE id = v_colid;
  UPDATE erp_customers SET balance = balance - v_applied WHERE id = p_customer_id;

  collection_id := v_colid; collection_number := v_colno;
  total_applied := v_applied; unapplied := round(p_amount - v_applied, 2);
  RETURN NEXT; RETURN;
END $$;

REVOKE EXECUTE ON FUNCTION public.erp_settle_collection(uuid, uuid, numeric, text, text, jsonb, uuid, date) FROM anon;
