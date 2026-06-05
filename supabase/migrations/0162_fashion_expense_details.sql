-- ============================================================================
-- 0162: Fashion Store — richer expense entry (Phase 4).
-- ----------------------------------------------------------------------------
-- ADDITIVE & REVERSIBLE: new nullable columns on erp_expenses and an extended
-- erp_fashion_add_expense RPC (extra params are defaulted, so the existing
-- cash-box quick-expense call keeps working). Expense entry is now audited.
-- No data dropped; no destructive change.
-- ============================================================================

ALTER TABLE erp_expenses
  ADD COLUMN IF NOT EXISTS description    TEXT,
  ADD COLUMN IF NOT EXISTS paid_by        TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS attachment_url TEXT;

DROP FUNCTION IF EXISTS erp_fashion_add_expense(UUID, TEXT, NUMERIC, TEXT, TEXT);
CREATE OR REPLACE FUNCTION erp_fashion_add_expense(
  p_branch_id UUID, p_category TEXT, p_amount NUMERIC,
  p_paid_from TEXT DEFAULT 'cash', p_note TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL, p_payment_method TEXT DEFAULT NULL,
  p_paid_by TEXT DEFAULT NULL, p_attachment_url TEXT DEFAULT NULL,
  p_expense_date DATE DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_co UUID := erp_user_company_id(); v_uid UUID := auth.uid();
  v_exp UUID; v_acc_exp UUID; v_acc_cash UUID; v_entry UUID; v_sess UUID;
  v_amt NUMERIC := GREATEST(COALESCE(p_amount,0),0);
  v_paid_from TEXT; v_method TEXT; v_date DATE := COALESCE(p_expense_date, CURRENT_DATE);
BEGIN
  IF v_co IS NULL THEN RAISE EXCEPTION 'لا توجد شركة.'; END IF;
  IF v_amt <= 0 THEN RAISE EXCEPTION 'المبلغ يجب أن يكون أكبر من صفر.'; END IF;

  -- Cash vs bank for the journal / drawer decision; derive from method when given.
  v_paid_from := CASE
    WHEN p_payment_method IS NOT NULL THEN (CASE WHEN p_payment_method = 'cash' THEN 'cash' ELSE 'bank' END)
    WHEN p_paid_from = 'bank' THEN 'bank' ELSE 'cash' END;
  v_method := COALESCE(p_payment_method, CASE WHEN v_paid_from = 'bank' THEN 'bank_transfer' ELSE 'cash' END);

  INSERT INTO erp_expenses (company_id, branch_id, category, amount, expense_date, paid_from,
                            note, description, paid_by, payment_method, attachment_url, created_by)
  VALUES (v_co, p_branch_id, p_category, v_amt, v_date, v_paid_from,
          p_note, p_description, p_paid_by, v_method, p_attachment_url, v_uid)
  RETURNING id INTO v_exp;

  -- journal: Debit "Other Expenses" (5990) / Credit Cash (1100) or Bank (1120)
  SELECT id INTO v_acc_exp FROM erp_chart_of_accounts WHERE code = '5990' AND is_system LIMIT 1;
  SELECT id INTO v_acc_cash FROM erp_chart_of_accounts WHERE code = CASE WHEN v_paid_from='bank' THEN '1120' ELSE '1100' END AND is_system LIMIT 1;
  IF p_branch_id IS NOT NULL AND v_acc_exp IS NOT NULL AND v_acc_cash IS NOT NULL THEN
    INSERT INTO erp_journal_entries (entry_number, entry_date, description, reference_type, reference_id, branch_id, status, created_by, posted_by, posted_at)
    VALUES (erp_next_number(p_branch_id,'journal'), v_date, COALESCE(p_description, p_category, 'مصروف'), 'fashion_expense', v_exp, p_branch_id, 'posted', v_uid, v_uid, now())
    RETURNING id INTO v_entry;
    INSERT INTO erp_journal_lines (journal_entry_id, account_id, debit, credit) VALUES
      (v_entry, v_acc_exp, v_amt, 0), (v_entry, v_acc_cash, 0, v_amt);
  END IF;

  -- cash-box ledger (only cash-paid expenses hit the drawer)
  IF v_paid_from <> 'bank' THEN
    SELECT id INTO v_sess FROM erp_cash_sessions WHERE company_id = v_co AND branch_id = p_branch_id AND status = 'open' LIMIT 1;
    IF v_sess IS NOT NULL THEN
      INSERT INTO erp_cash_movements (company_id, session_id, kind, amount, reference_type, reference_id, note, created_by)
      VALUES (v_co, v_sess, 'expense', v_amt, 'fashion_expense', v_exp, COALESCE(p_description, p_category), v_uid);
    END IF;
  END IF;

  PERFORM erp_log_audit('expense_add', 'erp_expenses', v_exp::text,
    jsonb_build_object('amount', v_amt, 'category', p_category, 'payment_method', v_method), v_co);
  RETURN v_exp;
END $$;
REVOKE ALL ON FUNCTION erp_fashion_add_expense(UUID,TEXT,NUMERIC,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,DATE) FROM public;
GRANT EXECUTE ON FUNCTION erp_fashion_add_expense(UUID,TEXT,NUMERIC,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,DATE) TO authenticated, service_role;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- Restore the 0146 erp_fashion_add_expense(UUID,TEXT,NUMERIC,TEXT,TEXT) and
-- ALTER TABLE erp_expenses DROP COLUMN description, paid_by, payment_method, attachment_url.
