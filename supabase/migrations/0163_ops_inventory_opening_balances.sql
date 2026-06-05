-- ============================================================================
-- 0163: Operational Readiness — Inventory Foundation + Opening Balances
-- ----------------------------------------------------------------------------
-- Priority-1 operational scope for the store verticals (fashion + generic ERP):
--   1. Inventory count types (opening / monthly / spot) on the existing count flow
--   2. Manual stock adjustments with an audit trail + manager approval for large
--      adjustments + full reversal
--   3. Stock movement history (already captured in erp_stock_movements — no change)
--   4. Customer opening balances (previous debt / credit / installment)
--   5. Supplier opening balances
--   6. Existing-installment-contract migration (remaining balance / installments)
--
-- DESIGN CONTRACT (matches the user's rules):
--   * ADDITIVE — no shared table loses a column; only new tables + new nullable
--     columns with safe defaults.
--   * IDEMPOTENT + drift-safe — CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT
--     EXISTS, CREATE OR REPLACE, DROP POLICY/TRIGGER IF EXISTS. Safe to re-run.
--   * REVERSIBLE — every balance/stock effect has an explicit reversal RPC that
--     posts a compensating entry (never a destructive delete).
--   * AUDITED — every state change calls erp_log_audit(...).
--   * NO FMCG / DESTRUCTIVE CHANGES — reuses erp_stock_movements (+ its inventory
--     trigger), erp_customers/erp_suppliers running balances, erp_installment_*.
-- Reuses helpers: erp_set_company_id(), erp_set_updated_at(), erp_user_company_id(),
--   erp_is_platform_owner(), erp_has_branch_access(), erp_log_audit(), erp_next_number().
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- PART A — Inventory count types (opening / monthly / spot) on the count flow
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE erp_stock_counts
  ADD COLUMN IF NOT EXISTS count_type TEXT NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES erp_companies(id) ON DELETE CASCADE;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'erp_stock_counts_count_type_chk'
  ) THEN
    ALTER TABLE erp_stock_counts
      ADD CONSTRAINT erp_stock_counts_count_type_chk
      CHECK (count_type IN ('opening','monthly','spot'));
  END IF;
END $$;

-- Backfill company_id from the warehouse → branch chain (scoping convenience;
-- existing RLS keys off warehouse→branch and is untouched).
UPDATE erp_stock_counts sc
   SET company_id = b.company_id
  FROM erp_warehouses w
  JOIN erp_branches b ON b.id = w.branch_id
 WHERE sc.warehouse_id = w.id AND sc.company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_erp_stock_counts_company_type
  ON erp_stock_counts(company_id, count_type, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- PART B — Per-company operational settings (large-adjustment threshold)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_ops_settings (
  company_id              UUID PRIMARY KEY REFERENCES erp_companies(id) ON DELETE CASCADE,
  -- abs(quantity * unit_cost) at/above which a manual adjustment requires a
  -- manager's approval before it posts to stock.
  large_adjustment_value  NUMERIC(14,2) NOT NULL DEFAULT 1000,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PART C — Manual stock adjustments (audit trail + approval + reversal)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_stock_adjustments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  warehouse_id        UUID NOT NULL REFERENCES erp_warehouses(id) ON DELETE RESTRICT,
  product_id          UUID NOT NULL REFERENCES erp_products_catalog(id) ON DELETE RESTRICT,
  adjustment_qty      NUMERIC(14,3) NOT NULL,            -- signed: +increase / -decrease
  unit_cost           NUMERIC(14,2) NOT NULL DEFAULT 0,  -- snapshot of cost for valuation
  reason              TEXT,
  status              TEXT NOT NULL DEFAULT 'posted'
                        CHECK (status IN ('pending','posted','rejected','reversed')),
  movement_id         UUID REFERENCES erp_stock_movements(id) ON DELETE SET NULL,
  reversal_movement_id UUID REFERENCES erp_stock_movements(id) ON DELETE SET NULL,
  requested_by        UUID,
  approved_by         UUID,
  approved_at         TIMESTAMPTZ,
  rejected_by         UUID,
  rejected_at         TIMESTAMPTZ,
  reversed_by         UUID,
  reversed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_stock_adjustments_company ON erp_stock_adjustments(company_id, status);
CREATE INDEX IF NOT EXISTS idx_erp_stock_adjustments_wh ON erp_stock_adjustments(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_erp_stock_adjustments_product ON erp_stock_adjustments(product_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- PART D — Customer + supplier opening balances
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_customer_opening_balances (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  customer_id         UUID NOT NULL REFERENCES erp_customers(id) ON DELETE CASCADE,
  as_of_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  -- debit  = customer owed us at cutover (raises receivable)
  -- credit = we owed customer / advance (lowers receivable)
  -- installment = opening installment principal (informational; the real
  --   schedule comes from the installment-migration RPC so it is not double-counted)
  balance_type        TEXT NOT NULL DEFAULT 'debit'
                        CHECK (balance_type IN ('debit','credit','installment')),
  amount              NUMERIC(14,2) NOT NULL DEFAULT 0,  -- positive magnitude
  note                TEXT,
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','reversed')),
  applied_to_balance  BOOLEAN NOT NULL DEFAULT true,
  created_by          UUID,
  reversed_by         UUID,
  reversed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- one active opening balance per (customer, type)
CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_customer_opening_active
  ON erp_customer_opening_balances(customer_id, balance_type) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_erp_customer_opening_company ON erp_customer_opening_balances(company_id);

CREATE TABLE IF NOT EXISTS erp_supplier_opening_balances (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  supplier_id         UUID NOT NULL REFERENCES erp_suppliers(id) ON DELETE CASCADE,
  as_of_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  -- credit = we owed supplier at cutover (raises payable)
  -- debit  = advance we paid / supplier owes us (lowers payable)
  balance_type        TEXT NOT NULL DEFAULT 'credit'
                        CHECK (balance_type IN ('credit','debit')),
  amount              NUMERIC(14,2) NOT NULL DEFAULT 0,
  note                TEXT,
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','reversed')),
  applied_to_balance  BOOLEAN NOT NULL DEFAULT true,
  created_by          UUID,
  reversed_by         UUID,
  reversed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_supplier_opening_active
  ON erp_supplier_opening_balances(supplier_id, balance_type) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_erp_supplier_opening_company ON erp_supplier_opening_balances(company_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- PART E — Existing-installment-contract migration (additive columns)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE erp_installment_plans
  ADD COLUMN IF NOT EXISTS is_migrated   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reference     TEXT,
  ADD COLUMN IF NOT EXISTS contract_date DATE;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS + company-id trigger + updated_at + tenant policy (one loop, 0146 pattern)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'erp_ops_settings','erp_stock_adjustments',
    'erp_customer_opening_balances','erp_supplier_opening_balances'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_company ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_set_company BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()', t, t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at()', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%I_tenant" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%I_tenant" ON %I FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id()) WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id())', t, t);
  END LOOP;
END $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- RPCs
-- ═════════════════════════════════════════════════════════════════════════════

-- ── B/C: post a manual stock adjustment ──────────────────────────────────────
-- Small adjustments (|qty*cost| < threshold) post immediately as an 'adjustment'
-- stock movement. Large ones are queued ('pending') for a manager to approve.
CREATE OR REPLACE FUNCTION erp_post_stock_adjustment(
  p_warehouse_id UUID,
  p_product_id   UUID,
  p_qty          NUMERIC,
  p_reason       TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_co        UUID := erp_user_company_id();
  v_uid       UUID := auth.uid();
  v_branch    UUID;
  v_cost      NUMERIC;
  v_threshold NUMERIC;
  v_value     NUMERIC;
  v_large     BOOLEAN;
  v_mov       UUID;
  v_adj       UUID;
BEGIN
  IF v_co IS NULL THEN RAISE EXCEPTION 'لا توجد شركة مرتبطة.'; END IF;
  IF p_qty IS NULL OR p_qty = 0 THEN RAISE EXCEPTION 'أدخل كمية تسوية غير صفرية.'; END IF;

  SELECT branch_id INTO v_branch FROM erp_warehouses WHERE id = p_warehouse_id;
  IF v_branch IS NULL THEN RAISE EXCEPTION 'المخزن غير موجود.'; END IF;
  IF NOT erp_has_branch_access(v_branch) THEN RAISE EXCEPTION 'غير مصرح بالوصول لهذا الفرع'; END IF;

  SELECT COALESCE(cost_price, 0) INTO v_cost FROM erp_products_catalog WHERE id = p_product_id;
  IF v_cost IS NULL THEN RAISE EXCEPTION 'الصنف غير موجود.'; END IF;

  SELECT COALESCE(large_adjustment_value, 1000) INTO v_threshold FROM erp_ops_settings WHERE company_id = v_co;
  v_threshold := COALESCE(v_threshold, 1000);
  v_value := abs(p_qty) * v_cost;
  v_large := v_value >= v_threshold;

  IF v_large THEN
    INSERT INTO erp_stock_adjustments (company_id, warehouse_id, product_id, adjustment_qty, unit_cost, reason, status, requested_by)
    VALUES (v_co, p_warehouse_id, p_product_id, p_qty, v_cost, p_reason, 'pending', v_uid)
    RETURNING id INTO v_adj;
    PERFORM erp_log_audit('stock_adjustment.requested', 'erp_stock_adjustments', v_adj::text,
      jsonb_build_object('qty', p_qty, 'value', v_value, 'threshold', v_threshold, 'reason', p_reason), v_co);
    RETURN jsonb_build_object('id', v_adj, 'status', 'pending', 'value', v_value);
  END IF;

  INSERT INTO erp_stock_movements (movement_type, warehouse_id, product_id, quantity, reference_type, notes, created_by)
  VALUES ('adjustment', p_warehouse_id, p_product_id, p_qty, 'manual', COALESCE(p_reason, 'تسوية يدوية'), v_uid)
  RETURNING id INTO v_mov;

  INSERT INTO erp_stock_adjustments (company_id, warehouse_id, product_id, adjustment_qty, unit_cost, reason, status, movement_id, requested_by)
  VALUES (v_co, p_warehouse_id, p_product_id, p_qty, v_cost, p_reason, 'posted', v_mov, v_uid)
  RETURNING id INTO v_adj;

  UPDATE erp_stock_movements SET reference_id = v_adj WHERE id = v_mov;

  PERFORM erp_log_audit('stock_adjustment.posted', 'erp_stock_adjustments', v_adj::text,
    jsonb_build_object('qty', p_qty, 'value', v_value, 'reason', p_reason, 'movement_id', v_mov), v_co);
  RETURN jsonb_build_object('id', v_adj, 'status', 'posted', 'value', v_value);
END $$;

-- ── approve a pending (large) adjustment → post the movement ──────────────────
CREATE OR REPLACE FUNCTION erp_approve_stock_adjustment(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_a erp_stock_adjustments; v_branch UUID; v_uid UUID := auth.uid(); v_mov UUID;
BEGIN
  SELECT * INTO v_a FROM erp_stock_adjustments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'التسوية غير موجودة.'; END IF;
  IF v_a.status <> 'pending' THEN RAISE EXCEPTION 'هذه التسوية ليست بانتظار الاعتماد.'; END IF;
  SELECT branch_id INTO v_branch FROM erp_warehouses WHERE id = v_a.warehouse_id;
  IF NOT erp_has_branch_access(v_branch) THEN RAISE EXCEPTION 'غير مصرح بالوصول لهذا الفرع'; END IF;

  INSERT INTO erp_stock_movements (movement_type, warehouse_id, product_id, quantity, reference_type, reference_id, notes, created_by)
  VALUES ('adjustment', v_a.warehouse_id, v_a.product_id, v_a.adjustment_qty, 'manual', v_a.id,
          COALESCE(v_a.reason, 'تسوية يدوية (معتمدة)'), v_uid)
  RETURNING id INTO v_mov;

  UPDATE erp_stock_adjustments
     SET status = 'posted', movement_id = v_mov, approved_by = v_uid, approved_at = now()
   WHERE id = p_id;

  PERFORM erp_log_audit('stock_adjustment.approved', 'erp_stock_adjustments', p_id::text,
    jsonb_build_object('qty', v_a.adjustment_qty, 'movement_id', v_mov), v_a.company_id);
END $$;

-- ── reject a pending adjustment ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION erp_reject_stock_adjustment(p_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_a erp_stock_adjustments; v_branch UUID; v_uid UUID := auth.uid();
BEGIN
  SELECT * INTO v_a FROM erp_stock_adjustments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'التسوية غير موجودة.'; END IF;
  IF v_a.status <> 'pending' THEN RAISE EXCEPTION 'هذه التسوية ليست بانتظار الاعتماد.'; END IF;
  SELECT branch_id INTO v_branch FROM erp_warehouses WHERE id = v_a.warehouse_id;
  IF NOT erp_has_branch_access(v_branch) THEN RAISE EXCEPTION 'غير مصرح بالوصول لهذا الفرع'; END IF;

  UPDATE erp_stock_adjustments
     SET status = 'rejected', rejected_by = v_uid, rejected_at = now(),
         reason = COALESCE(p_reason, reason)
   WHERE id = p_id;

  PERFORM erp_log_audit('stock_adjustment.rejected', 'erp_stock_adjustments', p_id::text,
    jsonb_build_object('reason', p_reason), v_a.company_id);
END $$;

-- ── reverse a posted adjustment → compensating movement ──────────────────────
CREATE OR REPLACE FUNCTION erp_reverse_stock_adjustment(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_a erp_stock_adjustments; v_branch UUID; v_uid UUID := auth.uid(); v_mov UUID;
BEGIN
  SELECT * INTO v_a FROM erp_stock_adjustments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'التسوية غير موجودة.'; END IF;
  IF v_a.status <> 'posted' THEN RAISE EXCEPTION 'يمكن عكس التسويات المرحّلة فقط.'; END IF;
  SELECT branch_id INTO v_branch FROM erp_warehouses WHERE id = v_a.warehouse_id;
  IF NOT erp_has_branch_access(v_branch) THEN RAISE EXCEPTION 'غير مصرح بالوصول لهذا الفرع'; END IF;

  INSERT INTO erp_stock_movements (movement_type, warehouse_id, product_id, quantity, reference_type, reference_id, notes, created_by)
  VALUES ('adjustment', v_a.warehouse_id, v_a.product_id, -v_a.adjustment_qty, 'manual', v_a.id,
          'عكس تسوية', v_uid)
  RETURNING id INTO v_mov;

  UPDATE erp_stock_adjustments
     SET status = 'reversed', reversal_movement_id = v_mov, reversed_by = v_uid, reversed_at = now()
   WHERE id = p_id;

  PERFORM erp_log_audit('stock_adjustment.reversed', 'erp_stock_adjustments', p_id::text,
    jsonb_build_object('reversal_movement_id', v_mov), v_a.company_id);
END $$;

-- ── D: set / replace a customer opening balance ──────────────────────────────
CREATE OR REPLACE FUNCTION erp_set_customer_opening_balance(
  p_customer_id UUID,
  p_amount      NUMERIC,
  p_type        TEXT DEFAULT 'debit',
  p_as_of       DATE DEFAULT NULL,
  p_note        TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_co UUID := erp_user_company_id();
  v_uid UUID := auth.uid();
  v_cust erp_customers;
  v_existing erp_customer_opening_balances;
  v_apply BOOLEAN;
  v_delta NUMERIC := 0;
  v_id UUID;
BEGIN
  IF v_co IS NULL THEN RAISE EXCEPTION 'لا توجد شركة مرتبطة.'; END IF;
  IF p_type NOT IN ('debit','credit','installment') THEN RAISE EXCEPTION 'نوع رصيد غير صحيح.'; END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN RAISE EXCEPTION 'المبلغ يجب أن يكون صفرًا أو أكثر.'; END IF;

  SELECT * INTO v_cust FROM erp_customers WHERE id = p_customer_id AND company_id = v_co;
  IF NOT FOUND THEN RAISE EXCEPTION 'العميل غير موجود.'; END IF;

  -- Reverse the effect of any prior active opening balance of this type first,
  -- so re-entry is idempotent (replace, not stack).
  SELECT * INTO v_existing FROM erp_customer_opening_balances
   WHERE customer_id = p_customer_id AND balance_type = p_type AND status = 'active' FOR UPDATE;
  IF FOUND THEN
    IF v_existing.applied_to_balance THEN
      v_delta := v_delta - (CASE v_existing.balance_type WHEN 'debit' THEN v_existing.amount
                                                          WHEN 'credit' THEN -v_existing.amount
                                                          ELSE 0 END);
    END IF;
    UPDATE erp_customer_opening_balances
       SET status = 'reversed', reversed_by = v_uid, reversed_at = now()
     WHERE id = v_existing.id;
  END IF;

  -- 'installment' opening balance is informational (the real schedule comes from
  -- erp_import_installment_contract) → not applied to the AR running balance.
  v_apply := p_type IN ('debit','credit');
  IF v_apply THEN
    v_delta := v_delta + (CASE p_type WHEN 'debit' THEN p_amount ELSE -p_amount END);
  END IF;

  INSERT INTO erp_customer_opening_balances
    (company_id, customer_id, as_of_date, balance_type, amount, note, applied_to_balance, created_by)
  VALUES (v_co, p_customer_id, COALESCE(p_as_of, CURRENT_DATE), p_type, p_amount, p_note, v_apply, v_uid)
  RETURNING id INTO v_id;

  IF v_delta <> 0 THEN
    UPDATE erp_customers SET balance = COALESCE(balance,0) + v_delta WHERE id = p_customer_id;
  END IF;

  PERFORM erp_log_audit('customer_opening_balance.set', 'erp_customers', p_customer_id::text,
    jsonb_build_object('opening_id', v_id, 'type', p_type, 'amount', p_amount, 'balance_delta', v_delta), v_co);
  RETURN jsonb_build_object('id', v_id, 'balance_delta', v_delta);
END $$;

-- ── reverse a customer opening balance ───────────────────────────────────────
CREATE OR REPLACE FUNCTION erp_reverse_customer_opening_balance(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_o erp_customer_opening_balances; v_uid UUID := auth.uid(); v_delta NUMERIC := 0;
BEGIN
  SELECT * INTO v_o FROM erp_customer_opening_balances WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الرصيد الافتتاحي غير موجود.'; END IF;
  IF v_o.status <> 'active' THEN RAISE EXCEPTION 'الرصيد الافتتاحي معكوس بالفعل.'; END IF;

  IF v_o.applied_to_balance THEN
    v_delta := -(CASE v_o.balance_type WHEN 'debit' THEN v_o.amount WHEN 'credit' THEN -v_o.amount ELSE 0 END);
    UPDATE erp_customers SET balance = COALESCE(balance,0) + v_delta WHERE id = v_o.customer_id;
  END IF;

  UPDATE erp_customer_opening_balances
     SET status = 'reversed', reversed_by = v_uid, reversed_at = now() WHERE id = p_id;

  PERFORM erp_log_audit('customer_opening_balance.reversed', 'erp_customers', v_o.customer_id::text,
    jsonb_build_object('opening_id', p_id, 'balance_delta', v_delta), v_o.company_id);
END $$;

-- ── D: set / replace a supplier opening balance ──────────────────────────────
CREATE OR REPLACE FUNCTION erp_set_supplier_opening_balance(
  p_supplier_id UUID,
  p_amount      NUMERIC,
  p_type        TEXT DEFAULT 'credit',
  p_as_of       DATE DEFAULT NULL,
  p_note        TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_co UUID := erp_user_company_id();
  v_uid UUID := auth.uid();
  v_sup erp_suppliers;
  v_existing erp_supplier_opening_balances;
  v_delta NUMERIC := 0;
  v_id UUID;
BEGIN
  IF v_co IS NULL THEN RAISE EXCEPTION 'لا توجد شركة مرتبطة.'; END IF;
  IF p_type NOT IN ('credit','debit') THEN RAISE EXCEPTION 'نوع رصيد غير صحيح.'; END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN RAISE EXCEPTION 'المبلغ يجب أن يكون صفرًا أو أكثر.'; END IF;

  SELECT * INTO v_sup FROM erp_suppliers WHERE id = p_supplier_id AND company_id = v_co;
  IF NOT FOUND THEN RAISE EXCEPTION 'المورد غير موجود.'; END IF;

  SELECT * INTO v_existing FROM erp_supplier_opening_balances
   WHERE supplier_id = p_supplier_id AND balance_type = p_type AND status = 'active' FOR UPDATE;
  IF FOUND THEN
    v_delta := v_delta - (CASE v_existing.balance_type WHEN 'credit' THEN v_existing.amount ELSE -v_existing.amount END);
    UPDATE erp_supplier_opening_balances
       SET status = 'reversed', reversed_by = v_uid, reversed_at = now() WHERE id = v_existing.id;
  END IF;

  v_delta := v_delta + (CASE p_type WHEN 'credit' THEN p_amount ELSE -p_amount END);

  INSERT INTO erp_supplier_opening_balances
    (company_id, supplier_id, as_of_date, balance_type, amount, note, applied_to_balance, created_by)
  VALUES (v_co, p_supplier_id, COALESCE(p_as_of, CURRENT_DATE), p_type, p_amount, p_note, true, v_uid)
  RETURNING id INTO v_id;

  IF v_delta <> 0 THEN
    UPDATE erp_suppliers SET balance = COALESCE(balance,0) + v_delta WHERE id = p_supplier_id;
  END IF;

  PERFORM erp_log_audit('supplier_opening_balance.set', 'erp_suppliers', p_supplier_id::text,
    jsonb_build_object('opening_id', v_id, 'type', p_type, 'amount', p_amount, 'balance_delta', v_delta), v_co);
  RETURN jsonb_build_object('id', v_id, 'balance_delta', v_delta);
END $$;

CREATE OR REPLACE FUNCTION erp_reverse_supplier_opening_balance(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_o erp_supplier_opening_balances; v_uid UUID := auth.uid(); v_delta NUMERIC := 0;
BEGIN
  SELECT * INTO v_o FROM erp_supplier_opening_balances WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الرصيد الافتتاحي غير موجود.'; END IF;
  IF v_o.status <> 'active' THEN RAISE EXCEPTION 'الرصيد الافتتاحي معكوس بالفعل.'; END IF;

  v_delta := -(CASE v_o.balance_type WHEN 'credit' THEN v_o.amount ELSE -v_o.amount END);
  UPDATE erp_suppliers SET balance = COALESCE(balance,0) + v_delta WHERE id = v_o.supplier_id;

  UPDATE erp_supplier_opening_balances
     SET status = 'reversed', reversed_by = v_uid, reversed_at = now() WHERE id = p_id;

  PERFORM erp_log_audit('supplier_opening_balance.reversed', 'erp_suppliers', v_o.supplier_id::text,
    jsonb_build_object('opening_id', p_id, 'balance_delta', v_delta), v_o.company_id);
END $$;

-- ── E: import an existing installment contract (remaining schedule) ───────────
-- Creates an invoice-less, migrated installment plan + an evenly split remaining
-- schedule, and raises the customer's receivable by the remaining financed
-- amount so it shows on statements. Reversible via erp_reverse_migrated_installment.
CREATE OR REPLACE FUNCTION erp_import_installment_contract(
  p_customer_id      UUID,
  p_branch_id        UUID,
  p_total_amount     NUMERIC,
  p_remaining_amount NUMERIC,
  p_remaining_count  INTEGER,
  p_frequency        TEXT DEFAULT 'monthly',
  p_first_due_date   DATE DEFAULT NULL,
  p_reference        TEXT DEFAULT NULL,
  p_contract_date    DATE DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_co UUID := erp_user_company_id();
  v_uid UUID := auth.uid();
  v_plan UUID;
  v_interval INTERVAL;
  v_count INTEGER := GREATEST(COALESCE(p_remaining_count,1), 1);
  v_each NUMERIC; v_acc NUMERIC := 0; v_amt NUMERIC; i INTEGER;
  v_start DATE := COALESCE(p_first_due_date, CURRENT_DATE);
  v_freq TEXT := CASE WHEN p_frequency IN ('weekly','biweekly','monthly') THEN p_frequency ELSE 'monthly' END;
BEGIN
  IF v_co IS NULL THEN RAISE EXCEPTION 'لا توجد شركة مرتبطة.'; END IF;
  IF p_customer_id IS NULL THEN RAISE EXCEPTION 'اختر عميلاً.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM erp_customers WHERE id = p_customer_id AND company_id = v_co) THEN
    RAISE EXCEPTION 'العميل غير موجود.';
  END IF;
  IF p_branch_id IS NOT NULL AND NOT erp_has_branch_access(p_branch_id) THEN
    RAISE EXCEPTION 'غير مصرح بالوصول لهذا الفرع';
  END IF;
  IF p_remaining_amount IS NULL OR p_remaining_amount <= 0 THEN
    RAISE EXCEPTION 'المبلغ المتبقي يجب أن يكون أكبر من صفر.';
  END IF;

  INSERT INTO erp_installment_plans
    (company_id, branch_id, invoice_id, customer_id, total_amount, down_payment, financed_amount,
     installment_count, frequency, start_date, status, is_migrated, reference, contract_date, created_by)
  VALUES (v_co, p_branch_id, NULL, p_customer_id,
          COALESCE(p_total_amount, p_remaining_amount), 0, p_remaining_amount,
          v_count, v_freq, v_start, 'active', true, p_reference, COALESCE(p_contract_date, CURRENT_DATE), v_uid)
  RETURNING id INTO v_plan;

  v_interval := CASE v_freq WHEN 'weekly' THEN INTERVAL '7 days'
                            WHEN 'biweekly' THEN INTERVAL '14 days'
                            ELSE INTERVAL '1 month' END;
  v_each := round((p_remaining_amount / v_count)::numeric, 2);
  FOR i IN 1..v_count LOOP
    IF i = v_count THEN v_amt := round((p_remaining_amount - v_acc)::numeric, 2);
    ELSE v_amt := v_each; v_acc := v_acc + v_each; END IF;
    INSERT INTO erp_installment_schedule (company_id, plan_id, seq_no, due_date, amount)
    VALUES (v_co, v_plan, i, (v_start + (v_interval * (i-1)))::date, v_amt);
  END LOOP;

  -- Remaining financed amount is outstanding receivable.
  UPDATE erp_customers SET balance = COALESCE(balance,0) + p_remaining_amount WHERE id = p_customer_id;

  PERFORM erp_log_audit('installment.migrated', 'erp_installment_plans', v_plan::text,
    jsonb_build_object('remaining', p_remaining_amount, 'count', v_count, 'reference', p_reference), v_co);
  RETURN jsonb_build_object('plan_id', v_plan, 'installments', v_count);
END $$;

CREATE OR REPLACE FUNCTION erp_reverse_migrated_installment(p_plan_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_p erp_installment_plans; v_uid UUID := auth.uid(); v_paid NUMERIC;
BEGIN
  SELECT * INTO v_p FROM erp_installment_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'العقد غير موجود.'; END IF;
  IF NOT v_p.is_migrated THEN RAISE EXCEPTION 'يمكن عكس العقود المرحّلة فقط.'; END IF;
  IF v_p.status = 'cancelled' THEN RAISE EXCEPTION 'العقد ملغي بالفعل.'; END IF;

  SELECT COALESCE(SUM(amount),0) INTO v_paid FROM erp_installment_payments WHERE plan_id = p_plan_id;
  IF v_paid > 0 THEN RAISE EXCEPTION 'لا يمكن العكس بعد تحصيل دفعات على العقد.'; END IF;

  -- Undo the receivable raise (only the still-unpaid financed amount remains).
  UPDATE erp_customers SET balance = COALESCE(balance,0) - v_p.financed_amount WHERE id = v_p.customer_id;
  UPDATE erp_installment_plans SET status = 'cancelled' WHERE id = p_plan_id;

  PERFORM erp_log_audit('installment.migration_reversed', 'erp_installment_plans', p_plan_id::text,
    jsonb_build_object('financed', v_p.financed_amount), v_p.company_id);
END $$;

-- ── grants (SECURITY DEFINER, locked to authenticated/service_role) ───────────
DO $$
DECLARE fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'erp_post_stock_adjustment(uuid,uuid,numeric,text)',
    'erp_approve_stock_adjustment(uuid)',
    'erp_reject_stock_adjustment(uuid,text)',
    'erp_reverse_stock_adjustment(uuid)',
    'erp_set_customer_opening_balance(uuid,numeric,text,date,text)',
    'erp_reverse_customer_opening_balance(uuid)',
    'erp_set_supplier_opening_balance(uuid,numeric,text,date,text)',
    'erp_reverse_supplier_opening_balance(uuid)',
    'erp_import_installment_contract(uuid,uuid,numeric,numeric,integer,text,date,text,date)',
    'erp_reverse_migrated_installment(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;
