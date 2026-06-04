-- ============================================================================
-- 0051: Post collected clinic fees to the accounting journal
-- ----------------------------------------------------------------------------
-- erp_collect_clinic_fee atomically (a) increments a visit's paid_amount and
-- (b) posts a balanced journal entry: Debit Cash (1100) / Credit Service
-- Revenue (4200) — so clinic income shows up in the company's financial
-- reports. Scoped to the caller's own company. If the accounting chart isn't
-- present it still records the payment and simply skips posting. Safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION erp_collect_clinic_fee(p_visit_id UUID, p_amount NUMERIC)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company UUID;
  v_branch  UUID;
  v_patient TEXT;
  v_cash    UUID;
  v_rev     UUID;
  v_entry   UUID;
  v_uid     UUID := auth.uid();
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ غير صحيح.';
  END IF;

  SELECT cv.company_id, cv.branch_id, p.name
    INTO v_company, v_branch, v_patient
    FROM erp_clinic_visits cv
    LEFT JOIN erp_patients p ON p.id = cv.patient_id
   WHERE cv.id = p_visit_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'الكشف غير موجود.'; END IF;

  IF NOT (erp_is_super_admin() OR v_company = erp_user_company_id()) THEN
    RAISE EXCEPTION 'غير مصرح.';
  END IF;

  -- 1) record the collection on the visit
  UPDATE erp_clinic_visits
     SET paid_amount = COALESCE(paid_amount, 0) + p_amount
   WHERE id = p_visit_id;

  -- 2) post to the journal (skip silently if accounting isn't set up)
  IF v_branch IS NULL THEN
    SELECT id INTO v_branch FROM erp_branches
     WHERE company_id = v_company AND is_active ORDER BY code LIMIT 1;
  END IF;
  IF v_branch IS NULL THEN RETURN; END IF;

  SELECT id INTO v_cash FROM erp_chart_of_accounts WHERE code = '1100' AND is_system LIMIT 1;
  SELECT id INTO v_rev  FROM erp_chart_of_accounts WHERE code = '4200' AND is_system LIMIT 1;
  IF v_cash IS NULL OR v_rev IS NULL THEN RETURN; END IF;

  INSERT INTO erp_journal_entries
    (entry_number, entry_date, description, reference_type, reference_id, branch_id, status, created_by, posted_by, posted_at)
  VALUES
    (erp_next_number(v_branch, 'journal'), CURRENT_DATE,
     'تحصيل كشف عيادة - ' || COALESCE(v_patient, ''),
     'clinic_payment', p_visit_id, v_branch, 'posted', v_uid, v_uid, now())
  RETURNING id INTO v_entry;

  INSERT INTO erp_journal_lines (journal_entry_id, account_id, debit, credit) VALUES
    (v_entry, v_cash, p_amount, 0),
    (v_entry, v_rev, 0, p_amount);
END $$;

REVOKE ALL ON FUNCTION erp_collect_clinic_fee(UUID, NUMERIC) FROM public;
GRANT EXECUTE ON FUNCTION erp_collect_clinic_fee(UUID, NUMERIC) TO authenticated;
