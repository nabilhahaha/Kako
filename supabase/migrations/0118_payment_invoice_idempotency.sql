-- ============================================================================
-- 0118: Payment & invoice idempotency (hardening — survive retries w/o duplicates)
-- ----------------------------------------------------------------------------
-- A network retry / double-submit must not create a duplicate financial record.
-- Adds a nullable idempotency_key + a UNIQUE partial index on each, and makes
-- erp_record_payment idempotent + race-safe (the unique index is the backstop).
-- Additive: with no key passed, behavior is unchanged.
-- ============================================================================

ALTER TABLE erp_payments ADD COLUMN IF NOT EXISTS idempotency_key UUID;
ALTER TABLE erp_invoices ADD COLUMN IF NOT EXISTS idempotency_key UUID;
CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_payments_idem ON erp_payments(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_invoices_idem ON erp_invoices(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Replace erp_record_payment with a 6-arg, idempotent version (drop the old
-- 5-arg signature first so there's no overload ambiguity for PostgREST).
DROP FUNCTION IF EXISTS erp_record_payment(uuid, numeric, erp_payment_method, text, date);

CREATE OR REPLACE FUNCTION erp_record_payment(
  p_invoice_id UUID,
  p_amount NUMERIC,
  p_method erp_payment_method,
  p_ref TEXT,
  p_date DATE,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_inv erp_invoices;
  v_remaining NUMERIC;
  v_uid UUID := auth.uid();
BEGIN
  -- Idempotency: a retry with the same key is a no-op (the payment already posted).
  IF p_idempotency_key IS NOT NULL AND EXISTS (SELECT 1 FROM erp_payments WHERE idempotency_key = p_idempotency_key) THEN
    RETURN;
  END IF;

  SELECT * INTO v_inv FROM erp_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
  IF NOT erp_has_branch_access(v_inv.branch_id) THEN RAISE EXCEPTION 'غير مصرح بالوصول لهذا الفرع'; END IF;
  IF v_inv.status = 'draft' THEN RAISE EXCEPTION 'أصدر الفاتورة قبل التحصيل'; END IF;
  IF v_inv.status = 'cancelled' THEN RAISE EXCEPTION 'الفاتورة ملغية'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'المبلغ يجب أن يكون أكبر من صفر'; END IF;

  v_remaining := v_inv.net_amount - v_inv.paid_amount;
  IF p_amount > v_remaining + 0.001 THEN
    RAISE EXCEPTION 'المبلغ يتجاوز المتبقي (%)', round(v_remaining, 2);
  END IF;

  -- Race backstop: a concurrent identical retry loses the unique index and is a no-op.
  BEGIN
    INSERT INTO erp_payments (invoice_id, amount, payment_method, reference_number, payment_date, received_by, idempotency_key)
    VALUES (p_invoice_id, p_amount, p_method, NULLIF(btrim(p_ref), ''), COALESCE(p_date, CURRENT_DATE), v_uid, p_idempotency_key);
  EXCEPTION WHEN unique_violation THEN
    RETURN;  -- another transaction already recorded this exact payment
  END;

  UPDATE erp_customers SET balance = balance - p_amount WHERE id = v_inv.customer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS uq_erp_payments_idem; DROP INDEX IF EXISTS uq_erp_invoices_idem;
-- ALTER TABLE erp_payments DROP COLUMN IF EXISTS idempotency_key;
-- ALTER TABLE erp_invoices DROP COLUMN IF EXISTS idempotency_key;
-- (restore the 5-arg erp_record_payment from 0007 if needed)
