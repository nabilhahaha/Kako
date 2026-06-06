-- ============================================================================
-- 0167: Manual installment-amount flexibility
-- ----------------------------------------------------------------------------
-- Two additive RPCs (no schema change, no new FK) that make installment plans
-- flexible without breaking the existing equal-split flow:
--
--   * erp_collect_installment_flex(schedule_id, amount, method)
--       Pay MORE or LESS than the scheduled amount:
--         - under  → the row goes 'partial', remainder stays outstanding;
--         - exact  → the row goes 'paid';
--         - over   → the excess WATERFALLS onto the next unpaid rows of the
--                    same plan; anything still left is kept as an advance
--                    (recorded as a schedule-less prepayment payment).
--       Reduces the customer receivable for BOTH invoice-based plans (via
--       erp_record_payment) AND migrated plans (direct balance decrement —
--       fixes the gap where migrated collections never lowered the balance).
--       Posts the cash-box collection + audits 'installment.collected'.
--
--   * erp_set_installment_amounts(plan_id, amounts numeric[], allow_mismatch)
--       Manually set the per-installment amounts (instead of equal split), at
--       creation/migration or later. Reconciles the sum to the plan's financed
--       amount unless allow_mismatch. Never sets a row below what is already
--       paid on it. Audits 'installment.schedule_adjusted'.
--
-- Reuses erp_record_payment(), the cash box, and erp_log_audit(). The legacy
-- erp_fashion_collect_installment stays for back-compat (the UI moves to flex).
-- ============================================================================

CREATE OR REPLACE FUNCTION erp_collect_installment_flex(
  p_schedule_id UUID,
  p_amount      NUMERIC,
  p_method      TEXT DEFAULT 'cash'
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_co     UUID := erp_user_company_id();
  v_uid    UUID := auth.uid();
  v_sched  erp_installment_schedule;
  v_plan   erp_installment_plans;
  v_left   NUMERIC;
  v_apply  NUMERIC;
  v_row    RECORD;
  v_total  NUMERIC := 0;
  v_advance NUMERIC := 0;
  v_open   INT;
  v_pm     erp_payment_method;
  v_sess   UUID;
BEGIN
  SELECT * INTO v_sched FROM erp_installment_schedule WHERE id = p_schedule_id FOR UPDATE;
  IF v_sched.id IS NULL THEN RAISE EXCEPTION 'القسط غير موجود.'; END IF;
  IF NOT (erp_is_platform_owner() OR v_sched.company_id = v_co) THEN RAISE EXCEPTION 'غير مصرح.'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'المبلغ يجب أن يكون أكبر من صفر.'; END IF;
  SELECT * INTO v_plan FROM erp_installment_plans WHERE id = v_sched.plan_id FOR UPDATE;
  IF v_plan.status = 'cancelled' THEN RAISE EXCEPTION 'العقد ملغي.'; END IF;
  v_pm := (CASE WHEN p_method = 'card' THEN 'credit_card' ELSE 'cash' END)::erp_payment_method;

  v_left := p_amount;

  -- 1) Fill the selected row first, then waterfall onto later unpaid rows (by seq).
  FOR v_row IN
    SELECT * FROM erp_installment_schedule
    WHERE plan_id = v_plan.id AND status <> 'paid'
      AND seq_no >= v_sched.seq_no
    ORDER BY seq_no
    FOR UPDATE
  LOOP
    EXIT WHEN v_left <= 0.0001;
    v_apply := LEAST(v_left, GREATEST(v_row.amount - v_row.paid_amount, 0));
    IF v_apply <= 0 THEN CONTINUE; END IF;
    UPDATE erp_installment_schedule
      SET paid_amount = paid_amount + v_apply,
          status = CASE WHEN paid_amount + v_apply >= amount - 0.001 THEN 'paid' ELSE 'partial' END,
          paid_at = CASE WHEN paid_amount + v_apply >= amount - 0.001 THEN now() ELSE paid_at END
      WHERE id = v_row.id;
    INSERT INTO erp_installment_payments (company_id, plan_id, schedule_id, amount, method, received_by)
    VALUES (v_co, v_plan.id, v_row.id, v_apply, CASE WHEN p_method='card' THEN 'card' ELSE 'cash' END, v_uid);
    v_total := v_total + v_apply;
    v_left := v_left - v_apply;
  END LOOP;

  -- 2) Anything still left is an advance / prepayment (no schedule row).
  IF v_left > 0.0001 THEN
    v_advance := v_left;
    INSERT INTO erp_installment_payments (company_id, plan_id, schedule_id, amount, method, received_by)
    VALUES (v_co, v_plan.id, NULL, v_advance, CASE WHEN p_method='card' THEN 'card' ELSE 'cash' END, v_uid);
    v_total := v_total + v_advance;
  END IF;

  -- 3) Reduce the customer receivable. Invoice-based plans go through the
  --    payment RPC; migrated (invoice-less) plans decrement the balance directly.
  IF v_total > 0 THEN
    IF v_plan.invoice_id IS NOT NULL THEN
      PERFORM erp_record_payment(v_plan.invoice_id, LEAST(v_total, (SELECT net_amount - paid_amount FROM erp_invoices WHERE id = v_plan.invoice_id)),
                                 v_pm, 'installment', CURRENT_DATE, gen_random_uuid());
    ELSIF v_plan.customer_id IS NOT NULL THEN
      UPDATE erp_customers SET balance = balance - v_total WHERE id = v_plan.customer_id;
    END IF;

    -- Cash-box collection in the branch's open session (cash only).
    SELECT id INTO v_sess FROM erp_cash_sessions WHERE company_id = v_co AND branch_id = v_plan.branch_id AND status = 'open' LIMIT 1;
    IF v_sess IS NOT NULL AND p_method <> 'card' THEN
      INSERT INTO erp_cash_movements (company_id, session_id, kind, amount, reference_type, reference_id, note, created_by)
      VALUES (v_co, v_sess, 'collection', v_total, 'installment', v_plan.id, NULL, v_uid);
    END IF;
  END IF;

  SELECT count(*) INTO v_open FROM erp_installment_schedule WHERE plan_id = v_plan.id AND status <> 'paid';
  IF v_open = 0 THEN UPDATE erp_installment_plans SET status = 'completed' WHERE id = v_plan.id; END IF;

  PERFORM erp_log_audit('installment.collected', 'erp_installment_plans', v_plan.id::text,
    jsonb_build_object('schedule_id', p_schedule_id, 'amount', v_total, 'advance', v_advance,
                       'method', p_method, 'plan_completed', (v_open = 0)), v_co);

  RETURN jsonb_build_object('applied', v_total, 'advance', v_advance, 'plan_completed', (v_open = 0));
END $$;
REVOKE ALL ON FUNCTION erp_collect_installment_flex(UUID, NUMERIC, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION erp_collect_installment_flex(UUID, NUMERIC, TEXT) TO authenticated, service_role;

-- ── Manual per-installment amounts ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION erp_set_installment_amounts(
  p_plan_id        UUID,
  p_amounts        NUMERIC[],
  p_allow_mismatch BOOLEAN DEFAULT false
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_co    UUID := erp_user_company_id();
  v_plan  erp_installment_plans;
  v_rows  erp_installment_schedule[];
  v_count INT;
  v_sum   NUMERIC := 0;
  v_i     INT;
  v_row   erp_installment_schedule;
  v_amt   NUMERIC;
BEGIN
  SELECT * INTO v_plan FROM erp_installment_plans WHERE id = p_plan_id FOR UPDATE;
  IF v_plan.id IS NULL THEN RAISE EXCEPTION 'العقد غير موجود.'; END IF;
  IF NOT (erp_is_platform_owner() OR v_plan.company_id = v_co) THEN RAISE EXCEPTION 'غير مصرح.'; END IF;
  IF v_plan.status <> 'active' THEN RAISE EXCEPTION 'يمكن تعديل الأقساط للعقود النشطة فقط.'; END IF;

  SELECT array_agg(s ORDER BY s.seq_no) INTO v_rows FROM erp_installment_schedule s WHERE s.plan_id = p_plan_id;
  v_count := COALESCE(array_length(v_rows, 1), 0);
  IF v_count = 0 THEN RAISE EXCEPTION 'لا يوجد جدول أقساط.'; END IF;
  IF array_length(p_amounts, 1) <> v_count THEN
    RAISE EXCEPTION 'عدد القيم (%) لا يطابق عدد الأقساط (%).', array_length(p_amounts, 1), v_count;
  END IF;

  FOR v_i IN 1..v_count LOOP
    v_amt := round(COALESCE(p_amounts[v_i], 0)::numeric, 2);
    IF v_amt < 0 THEN RAISE EXCEPTION 'قيمة القسط يجب ألا تكون سالبة.'; END IF;
    IF v_amt < v_rows[v_i].paid_amount - 0.001 THEN
      RAISE EXCEPTION 'لا يمكن جعل قيمة القسط أقل من المسدد عليه (%).', v_rows[v_i].paid_amount;
    END IF;
    v_sum := v_sum + v_amt;
  END LOOP;

  IF NOT p_allow_mismatch AND abs(v_sum - v_plan.financed_amount) > 0.01 THEN
    RAISE EXCEPTION 'إجمالي الأقساط (%) يجب أن يساوي المبلغ الممول (%).', v_sum, v_plan.financed_amount;
  END IF;

  FOR v_i IN 1..v_count LOOP
    v_amt := round(COALESCE(p_amounts[v_i], 0)::numeric, 2);
    UPDATE erp_installment_schedule
      SET amount = v_amt,
          status = CASE WHEN paid_amount >= v_amt - 0.001 THEN 'paid'
                        WHEN paid_amount > 0 THEN 'partial' ELSE 'due' END
      WHERE id = v_rows[v_i].id;
  END LOOP;

  PERFORM erp_log_audit('installment.schedule_adjusted', 'erp_installment_plans', p_plan_id::text,
    jsonb_build_object('amounts', p_amounts, 'sum', v_sum, 'financed', v_plan.financed_amount, 'allow_mismatch', p_allow_mismatch), v_co);

  RETURN jsonb_build_object('sum', v_sum, 'count', v_count);
END $$;
REVOKE ALL ON FUNCTION erp_set_installment_amounts(UUID, NUMERIC[], BOOLEAN) FROM public;
GRANT EXECUTE ON FUNCTION erp_set_installment_amounts(UUID, NUMERIC[], BOOLEAN) TO authenticated, service_role;
