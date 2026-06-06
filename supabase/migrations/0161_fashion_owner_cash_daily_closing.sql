-- ============================================================================
-- 0161: Fashion Store — Owner cash (withdrawal/deposit), cash adjustments,
--       and an enriched daily-closing snapshot. Phase 3.
-- ----------------------------------------------------------------------------
-- ALL ADDITIVE & REVERSIBLE:
--   • widen erp_cash_movements.kind to also allow owner_withdrawal / owner_deposit
--     / adjustment (the cash ledger now records every movement type),
--   • new table erp_fashion_owner_cash_txns (owner draws & deposits, audited),
--   • nullable daily-closing snapshot columns on erp_cash_sessions,
--   • RPCs for owner cash + cash adjustment (both audited, both require an open
--     session), and an enriched close that stores the full breakdown +
--     carry-forward.
-- No data is dropped; existing rows and the 2-arg call sites keep working
-- (close gains an optional p_notes with a default).
-- ============================================================================

-- ── 1. Cash ledger: allow the new movement kinds ────────────────────────────
ALTER TABLE erp_cash_movements DROP CONSTRAINT IF EXISTS erp_cash_movements_kind_check;
ALTER TABLE erp_cash_movements ADD CONSTRAINT erp_cash_movements_kind_check
  CHECK (kind IN ('sale','collection','supplier_payment','expense','payout','payin',
                  'owner_withdrawal','owner_deposit','adjustment'));

-- ── 2. Owner cash transactions (withdrawals & deposits) ─────────────────────
CREATE TABLE IF NOT EXISTS erp_fashion_owner_cash_txns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  branch_id    UUID REFERENCES erp_branches(id) ON DELETE SET NULL,
  session_id   UUID REFERENCES erp_cash_sessions(id) ON DELETE SET NULL,
  direction    TEXT NOT NULL CHECK (direction IN ('withdrawal','deposit')),
  amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  taken_by     UUID,            -- who physically took / brought the cash
  confirmed_by UUID,            -- staff who recorded it
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- FK-covering indexes (first column = FK column) so the schema-health guard stays green.
CREATE INDEX IF NOT EXISTS idx_erp_fashion_owner_cash_company ON erp_fashion_owner_cash_txns(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_erp_fashion_owner_cash_branch  ON erp_fashion_owner_cash_txns(branch_id);
CREATE INDEX IF NOT EXISTS idx_erp_fashion_owner_cash_session ON erp_fashion_owner_cash_txns(session_id);

ALTER TABLE erp_fashion_owner_cash_txns ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS erp_fashion_owner_cash_txns_set_company ON erp_fashion_owner_cash_txns;
CREATE TRIGGER erp_fashion_owner_cash_txns_set_company BEFORE INSERT ON erp_fashion_owner_cash_txns
  FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();
DROP POLICY IF EXISTS "erp_fashion_owner_cash_txns_tenant" ON erp_fashion_owner_cash_txns;
CREATE POLICY "erp_fashion_owner_cash_txns_tenant" ON erp_fashion_owner_cash_txns FOR ALL
  USING ((SELECT erp_is_platform_owner()) OR company_id = (SELECT erp_user_company_id()))
  WITH CHECK ((SELECT erp_is_platform_owner()) OR company_id = (SELECT erp_user_company_id()));

-- ── 3. Daily-closing snapshot columns (all nullable, filled at close) ───────
ALTER TABLE erp_cash_sessions
  ADD COLUMN IF NOT EXISTS cash_sales        NUMERIC,
  ADD COLUMN IF NOT EXISTS card_sales        NUMERIC,
  ADD COLUMN IF NOT EXISTS transfer_sales    NUMERIC,
  ADD COLUMN IF NOT EXISTS total_expenses    NUMERIC,
  ADD COLUMN IF NOT EXISTS owner_withdrawals NUMERIC,
  ADD COLUMN IF NOT EXISTS owner_deposits    NUMERIC,
  ADD COLUMN IF NOT EXISTS carried_forward   NUMERIC,
  ADD COLUMN IF NOT EXISTS notes             TEXT;

-- Daily closing lifecycle: open → draft_closed → closed (final), with manager re-open.
ALTER TABLE erp_cash_sessions DROP CONSTRAINT IF EXISTS erp_cash_sessions_status_check;
ALTER TABLE erp_cash_sessions ADD CONSTRAINT erp_cash_sessions_status_check
  CHECK (status IN ('open','draft_closed','closed'));

-- Re-open the partial-unique guard so a branch cannot have a second session while
-- one is still open OR draft-closed (must finalize or re-open first).
CREATE OR REPLACE FUNCTION erp_fashion_open_cashbox(p_branch_id UUID, p_opening_float NUMERIC DEFAULT 0)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_co UUID := erp_user_company_id(); v_id UUID;
BEGIN
  IF v_co IS NULL THEN RAISE EXCEPTION 'لا توجد شركة.'; END IF;
  IF EXISTS (SELECT 1 FROM erp_cash_sessions
             WHERE company_id = v_co AND branch_id = p_branch_id AND status IN ('open','draft_closed')) THEN
    RAISE EXCEPTION 'يوجد صندوق مفتوح أو مغلق مبدئيًا لهذا الفرع.';
  END IF;
  INSERT INTO erp_cash_sessions (company_id, branch_id, opened_by, opening_float, status)
  VALUES (v_co, p_branch_id, auth.uid(), GREATEST(COALESCE(p_opening_float,0),0), 'open')
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION erp_fashion_open_cashbox(UUID,NUMERIC) FROM public;
GRANT EXECUTE ON FUNCTION erp_fashion_open_cashbox(UUID,NUMERIC) TO authenticated, service_role;

-- ── 4. Owner cash RPC (withdrawal/deposit) ──────────────────────────────────
CREATE OR REPLACE FUNCTION erp_fashion_owner_cash(
  p_branch_id UUID, p_direction TEXT, p_amount NUMERIC, p_note TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_co UUID := erp_user_company_id(); v_uid UUID := auth.uid();
  v_sess UUID; v_amt NUMERIC := GREATEST(COALESCE(p_amount,0),0); v_kind TEXT; v_id UUID;
BEGIN
  IF v_co IS NULL THEN RAISE EXCEPTION 'لا توجد شركة.'; END IF;
  IF p_direction NOT IN ('withdrawal','deposit') THEN RAISE EXCEPTION 'اتجاه غير صحيح.'; END IF;
  IF v_amt <= 0 THEN RAISE EXCEPTION 'أدخل مبلغًا صحيحًا.'; END IF;
  SELECT id INTO v_sess FROM erp_cash_sessions
    WHERE company_id = v_co AND branch_id = p_branch_id AND status = 'open' LIMIT 1;
  IF v_sess IS NULL THEN RAISE EXCEPTION 'افتح الصندوق أولاً.'; END IF;

  v_kind := CASE WHEN p_direction = 'withdrawal' THEN 'owner_withdrawal' ELSE 'owner_deposit' END;
  INSERT INTO erp_fashion_owner_cash_txns (company_id, branch_id, session_id, direction, amount, taken_by, confirmed_by, note)
    VALUES (v_co, p_branch_id, v_sess, p_direction, v_amt, v_uid, v_uid, p_note)
    RETURNING id INTO v_id;
  INSERT INTO erp_cash_movements (company_id, session_id, kind, amount, reference_type, reference_id, note, created_by)
    VALUES (v_co, v_sess, v_kind, v_amt, 'owner_cash', v_id, p_note, v_uid);
  PERFORM erp_log_audit(v_kind, 'erp_fashion_owner_cash_txns', v_id::text,
                        jsonb_build_object('amount', v_amt, 'direction', p_direction), v_co);
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION erp_fashion_owner_cash(UUID,TEXT,NUMERIC,TEXT) FROM public;
GRANT EXECUTE ON FUNCTION erp_fashion_owner_cash(UUID,TEXT,NUMERIC,TEXT) TO authenticated, service_role;

-- ── 5. Cash adjustment RPC (signed correction, audited) ─────────────────────
CREATE OR REPLACE FUNCTION erp_fashion_cash_adjust(
  p_branch_id UUID, p_amount NUMERIC, p_note TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_co UUID := erp_user_company_id(); v_uid UUID := auth.uid(); v_sess UUID; v_id UUID;
BEGIN
  IF v_co IS NULL THEN RAISE EXCEPTION 'لا توجد شركة.'; END IF;
  IF COALESCE(p_amount,0) = 0 THEN RAISE EXCEPTION 'أدخل مبلغ التسوية.'; END IF;
  SELECT id INTO v_sess FROM erp_cash_sessions
    WHERE company_id = v_co AND branch_id = p_branch_id AND status = 'open' LIMIT 1;
  IF v_sess IS NULL THEN RAISE EXCEPTION 'افتح الصندوق أولاً.'; END IF;

  INSERT INTO erp_cash_movements (company_id, session_id, kind, amount, reference_type, note, created_by)
    VALUES (v_co, v_sess, 'adjustment', p_amount, 'adjustment', p_note, v_uid)
    RETURNING id INTO v_id;
  PERFORM erp_log_audit('cash_adjust', 'erp_cash_movements', v_id::text,
                        jsonb_build_object('amount', p_amount), v_co);
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION erp_fashion_cash_adjust(UUID,NUMERIC,TEXT) FROM public;
GRANT EXECUTE ON FUNCTION erp_fashion_cash_adjust(UUID,NUMERIC,TEXT) TO authenticated, service_role;

-- ── 6. Enriched close: full breakdown + carry-forward + audit ───────────────
-- Replace the 2-arg signature with a 3-arg one (optional notes, defaulted) so
-- existing 2-arg callers keep working.
DROP FUNCTION IF EXISTS erp_fashion_close_cashbox(UUID, NUMERIC);
DROP FUNCTION IF EXISTS erp_fashion_close_cashbox(UUID, NUMERIC, TEXT);
CREATE OR REPLACE FUNCTION erp_fashion_close_cashbox(
  p_session_id UUID, p_counted NUMERIC, p_notes TEXT DEFAULT NULL, p_final BOOLEAN DEFAULT true
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_co UUID := erp_user_company_id(); s erp_cash_sessions;
  v_in NUMERIC; v_out NUMERIC; v_adj NUMERIC; v_expected NUMERIC;
  v_cash NUMERIC; v_exp NUMERIC; v_owd NUMERIC; v_odp NUMERIC; v_card NUMERIC; v_xfer NUMERIC;
  v_status TEXT := CASE WHEN p_final THEN 'closed' ELSE 'draft_closed' END;
BEGIN
  SELECT * INTO s FROM erp_cash_sessions WHERE id = p_session_id FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'الصندوق غير موجود.'; END IF;
  IF NOT (erp_is_platform_owner() OR s.company_id = v_co) THEN RAISE EXCEPTION 'غير مصرح.'; END IF;
  IF s.status = 'closed' THEN RAISE EXCEPTION 'الصندوق مغلق نهائيًا. أعد الفتح أولاً.'; END IF;

  -- Cash-drawer movements
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE kind IN ('sale','collection','payin','owner_deposit')), 0),
    COALESCE(SUM(amount) FILTER (WHERE kind IN ('expense','supplier_payment','payout','owner_withdrawal')), 0),
    COALESCE(SUM(amount) FILTER (WHERE kind = 'adjustment'), 0),
    COALESCE(SUM(amount) FILTER (WHERE kind = 'sale'), 0),
    COALESCE(SUM(amount) FILTER (WHERE kind = 'expense'), 0),
    COALESCE(SUM(amount) FILTER (WHERE kind = 'owner_withdrawal'), 0),
    COALESCE(SUM(amount) FILTER (WHERE kind = 'owner_deposit'), 0)
    INTO v_in, v_out, v_adj, v_cash, v_exp, v_owd, v_odp
    FROM erp_cash_movements WHERE session_id = p_session_id;

  -- Non-cash tender for the daily report (by payment method, this session window).
  -- erp_invoices is scoped by branch (not company), so resolve company via branch.
  SELECT
    COALESCE(SUM(p.amount) FILTER (WHERE p.payment_method = 'credit_card'), 0),
    COALESCE(SUM(p.amount) FILTER (WHERE p.payment_method = 'bank_transfer'), 0)
    INTO v_card, v_xfer
    FROM erp_payments p
    JOIN erp_invoices i ON i.id = p.invoice_id
    JOIN erp_branches bb ON bb.id = i.branch_id
    WHERE bb.company_id = s.company_id
      AND (s.branch_id IS NULL OR i.branch_id = s.branch_id)
      AND p.created_at >= s.opened_at;

  v_expected := s.opening_float + v_in - v_out + v_adj;

  UPDATE erp_cash_sessions SET
      status = v_status, closing_counted = COALESCE(p_counted, 0),
      expected_amount = v_expected, variance = COALESCE(p_counted,0) - v_expected,
      cash_sales = v_cash, card_sales = v_card, transfer_sales = v_xfer,
      total_expenses = v_exp, owner_withdrawals = v_owd, owner_deposits = v_odp,
      carried_forward = COALESCE(p_counted, 0), notes = p_notes,
      closed_by = auth.uid(), closed_at = now()
    WHERE id = p_session_id;

  PERFORM erp_log_audit(CASE WHEN p_final THEN 'cashbox_close' ELSE 'cashbox_draft_close' END,
    'erp_cash_sessions', p_session_id::text,
    jsonb_build_object('expected', v_expected, 'counted', COALESCE(p_counted,0),
      'variance', COALESCE(p_counted,0) - v_expected, 'cash_sales', v_cash,
      'card_sales', v_card, 'transfer_sales', v_xfer, 'expenses', v_exp,
      'owner_withdrawals', v_owd, 'owner_deposits', v_odp, 'final', p_final), s.company_id);

  RETURN jsonb_build_object('status', v_status, 'expected', v_expected, 'counted', COALESCE(p_counted,0),
    'variance', COALESCE(p_counted,0) - v_expected, 'cash_sales', v_cash,
    'card_sales', v_card, 'transfer_sales', v_xfer, 'expenses', v_exp,
    'owner_withdrawals', v_owd, 'owner_deposits', v_odp, 'carried_forward', COALESCE(p_counted,0));
END $$;
REVOKE ALL ON FUNCTION erp_fashion_close_cashbox(UUID,NUMERIC,TEXT,BOOLEAN) FROM public;
GRANT EXECUTE ON FUNCTION erp_fashion_close_cashbox(UUID,NUMERIC,TEXT,BOOLEAN) TO authenticated, service_role;

-- ── 7. Re-open a (draft or final) closing — manager only, audited with reason ─
CREATE OR REPLACE FUNCTION erp_fashion_reopen_cashbox(p_session_id UUID, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_co UUID := erp_user_company_id(); s erp_cash_sessions;
BEGIN
  SELECT * INTO s FROM erp_cash_sessions WHERE id = p_session_id FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'الصندوق غير موجود.'; END IF;
  IF NOT (erp_is_platform_owner() OR s.company_id = v_co) THEN RAISE EXCEPTION 'غير مصرح.'; END IF;
  IF s.status = 'open' THEN RAISE EXCEPTION 'الصندوق مفتوح بالفعل.'; END IF;
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'أدخل سبب إعادة الفتح.'; END IF;
  IF EXISTS (SELECT 1 FROM erp_cash_sessions
             WHERE company_id = s.company_id AND branch_id IS NOT DISTINCT FROM s.branch_id
               AND status = 'open' AND id <> s.id) THEN
    RAISE EXCEPTION 'يوجد صندوق مفتوح لهذا الفرع.';
  END IF;
  UPDATE erp_cash_sessions SET status = 'open', closed_by = NULL, closed_at = NULL WHERE id = p_session_id;
  PERFORM erp_log_audit('cashbox_reopen', 'erp_cash_sessions', p_session_id::text,
    jsonb_build_object('reason', p_reason, 'from_status', s.status), s.company_id);
  RETURN jsonb_build_object('reopened', true);
END $$;
REVOKE ALL ON FUNCTION erp_fashion_reopen_cashbox(UUID,TEXT) FROM public;
GRANT EXECUTE ON FUNCTION erp_fashion_reopen_cashbox(UUID,TEXT) TO authenticated, service_role;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP FUNCTION erp_fashion_owner_cash(UUID,TEXT,NUMERIC,TEXT);
-- DROP FUNCTION erp_fashion_cash_adjust(UUID,NUMERIC,TEXT);
-- DROP FUNCTION erp_fashion_close_cashbox(UUID,NUMERIC,TEXT);  -- then recreate 0146 2-arg version
-- DROP TABLE erp_fashion_owner_cash_txns;
-- ALTER TABLE erp_cash_sessions DROP COLUMN cash_sales, ... (snapshot columns);
-- ALTER TABLE erp_cash_movements: restore the original kind CHECK (without the 3 new kinds).
