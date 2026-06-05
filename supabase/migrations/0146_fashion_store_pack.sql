-- ============================================================================
-- 0146: Fashion Store Industry Pack (business_type = clothing)
-- ----------------------------------------------------------------------------
-- A simple single-store clothing vertical: products with size/color VARIANTS
-- (each a real erp_products_catalog row → reuses inventory/invoice/stock/journal
-- with ZERO changes to shared commerce tables, so FMCG is untouched), cash +
-- installment sales, customer/supplier statements, a cash box, and expenses.
--
-- ADDITIVE + idempotent + drift-safe: every table is CREATE TABLE IF NOT EXISTS,
-- every function CREATE OR REPLACE, every policy DROP ... IF EXISTS. No shared
-- table gains a column. Reuses erp_issue_invoice() / erp_record_payment() and the
-- existing journal/stock triggers. Adds a 'fashion' module + 'fashion.*' perms
-- seeded ONLY to the clothing business type. Safe to re-run.
-- ============================================================================

-- ── Master data (company-managed) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_fashion_colors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL, name TEXT NOT NULL, name_ar TEXT, hex TEXT,
  sort INTEGER NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS erp_fashion_sizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL, name TEXT NOT NULL, size_group TEXT NOT NULL DEFAULT 'apparel',
  sort INTEGER NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS erp_fashion_seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL, name TEXT NOT NULL, name_ar TEXT, year INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS erp_fashion_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL, name TEXT NOT NULL, name_ar TEXT, is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

-- ── Style (the parent product the owner thinks in) ──────────────────────────
CREATE TABLE IF NOT EXISTS erp_fashion_styles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  code TEXT, name TEXT NOT NULL, name_ar TEXT,
  category_id UUID REFERENCES erp_product_categories(id) ON DELETE SET NULL,
  brand_id UUID REFERENCES erp_fashion_brands(id) ON DELETE SET NULL,
  season_id UUID REFERENCES erp_fashion_seasons(id) ON DELETE SET NULL,
  gender TEXT, department TEXT,
  default_supplier_id UUID REFERENCES erp_suppliers(id) ON DELETE SET NULL,
  image_url TEXT, notes TEXT, is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Variant: one row per size×color, bridged to a catalog row ────────────────
-- The catalog row (product_id) holds SKU(=code) / barcode / cost / cash price /
-- min stock / status / stock — so inventory + invoices + journals work unchanged.
CREATE TABLE IF NOT EXISTS erp_fashion_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  style_id UUID NOT NULL REFERENCES erp_fashion_styles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES erp_products_catalog(id) ON DELETE CASCADE,
  size_id UUID REFERENCES erp_fashion_sizes(id) ON DELETE SET NULL,
  color_id UUID REFERENCES erp_fashion_colors(id) ON DELETE SET NULL,
  installment_price NUMERIC NOT NULL DEFAULT 0,
  image_url TEXT, is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id), UNIQUE (style_id, size_id, color_id)
);

-- ── Installments ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_installment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES erp_branches(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES erp_invoices(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES erp_customers(id) ON DELETE SET NULL,
  total_amount NUMERIC NOT NULL DEFAULT 0, down_payment NUMERIC NOT NULL DEFAULT 0,
  financed_amount NUMERIC NOT NULL DEFAULT 0, installment_count INTEGER NOT NULL DEFAULT 1,
  frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('weekly','biweekly','monthly')),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','defaulted','cancelled')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (invoice_id)
);

CREATE TABLE IF NOT EXISTS erp_installment_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES erp_installment_plans(id) ON DELETE CASCADE,
  seq_no INTEGER NOT NULL, due_date DATE NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0, paid_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'due' CHECK (status IN ('due','partial','paid')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, seq_no)
);

CREATE TABLE IF NOT EXISTS erp_installment_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES erp_installment_plans(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES erp_installment_schedule(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL DEFAULT 0, method TEXT NOT NULL DEFAULT 'cash',
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(), received_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Cash box + expenses ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES erp_branches(id) ON DELETE SET NULL,
  opened_by UUID, opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  opening_float NUMERIC NOT NULL DEFAULT 0,
  closing_counted NUMERIC, expected_amount NUMERIC, variance NUMERIC,
  closed_by UUID, closed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- one open session per branch (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_cash_sessions_open
  ON erp_cash_sessions(company_id, branch_id) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS erp_cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  session_id UUID REFERENCES erp_cash_sessions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('sale','collection','supplier_payment','expense','payout','payin')),
  amount NUMERIC NOT NULL DEFAULT 0,
  reference_type TEXT, reference_id UUID, note TEXT, created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES erp_branches(id) ON DELETE SET NULL,
  category TEXT, amount NUMERIC NOT NULL DEFAULT 0, expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  paid_from TEXT NOT NULL DEFAULT 'cash' CHECK (paid_from IN ('cash','bank')),
  account_id UUID REFERENCES erp_chart_of_accounts(id) ON DELETE SET NULL,
  note TEXT, created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Retail conveniences ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_fashion_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES erp_branches(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES erp_customers(id) ON DELETE SET NULL,
  product_id UUID REFERENCES erp_products_catalog(id) ON DELETE CASCADE,
  qty NUMERIC NOT NULL DEFAULT 1, reserved_until DATE,
  status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held','converted','released')),
  note TEXT, created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_fashion_exchanges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES erp_branches(id) ON DELETE SET NULL,
  original_invoice_id UUID REFERENCES erp_invoices(id) ON DELETE SET NULL,
  returned_product_id UUID REFERENCES erp_products_catalog(id) ON DELETE SET NULL,
  new_product_id UUID REFERENCES erp_products_catalog(id) ON DELETE SET NULL,
  qty NUMERIC NOT NULL DEFAULT 1, price_difference NUMERIC NOT NULL DEFAULT 0,
  settled_method TEXT, created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_erp_fashion_styles_company ON erp_fashion_styles(company_id);
CREATE INDEX IF NOT EXISTS idx_erp_fashion_variants_style ON erp_fashion_variants(style_id);
CREATE INDEX IF NOT EXISTS idx_erp_fashion_variants_company ON erp_fashion_variants(company_id);
CREATE INDEX IF NOT EXISTS idx_erp_install_plans_company ON erp_installment_plans(company_id, status);
CREATE INDEX IF NOT EXISTS idx_erp_install_plans_customer ON erp_installment_plans(customer_id);
CREATE INDEX IF NOT EXISTS idx_erp_install_sched_plan ON erp_installment_schedule(plan_id);
CREATE INDEX IF NOT EXISTS idx_erp_install_sched_due ON erp_installment_schedule(company_id, due_date) WHERE status <> 'paid';
CREATE INDEX IF NOT EXISTS idx_erp_cash_sessions_branch ON erp_cash_sessions(company_id, branch_id, status);
CREATE INDEX IF NOT EXISTS idx_erp_cash_movements_session ON erp_cash_movements(session_id);
CREATE INDEX IF NOT EXISTS idx_erp_expenses_company ON erp_expenses(company_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_erp_fashion_reservations_company ON erp_fashion_reservations(company_id, status);

-- ── RLS + company_id trigger + updated_at + tenant policy (one loop) ─────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'erp_fashion_colors','erp_fashion_sizes','erp_fashion_seasons','erp_fashion_brands',
    'erp_fashion_styles','erp_fashion_variants',
    'erp_installment_plans','erp_installment_schedule','erp_installment_payments',
    'erp_cash_sessions','erp_cash_movements','erp_expenses',
    'erp_fashion_reservations','erp_fashion_exchanges'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_company ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_set_company BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%I_tenant" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%I_tenant" ON %I FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id()) WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id())', t, t);
  END LOOP;
  -- updated_at touch only on tables that carry it
  FOREACH t IN ARRAY ARRAY[
    'erp_fashion_colors','erp_fashion_sizes','erp_fashion_seasons','erp_fashion_brands',
    'erp_fashion_styles','erp_fashion_variants','erp_installment_plans','erp_installment_schedule',
    'erp_cash_sessions','erp_fashion_reservations'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at()', t, t);
  END LOOP;
END $$;

-- ── Seed default master data for a clothing company (idempotent) ─────────────
CREATE OR REPLACE FUNCTION erp_seed_fashion_lookups(p_company_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO erp_fashion_sizes (company_id, code, name, size_group, sort)
  SELECT p_company_id, v.code, v.name, 'apparel', v.sort FROM (VALUES
    ('XS','XS',10),('S','S',20),('M','M',30),('L','L',40),('XL','XL',50),('XXL','XXL',60)
  ) AS v(code, name, sort)
  WHERE NOT EXISTS (SELECT 1 FROM erp_fashion_sizes e WHERE e.company_id = p_company_id AND e.code = v.code);

  INSERT INTO erp_fashion_colors (company_id, code, name, name_ar, hex, sort)
  SELECT p_company_id, v.code, v.name, v.name_ar, v.hex, v.sort FROM (VALUES
    ('black','Black','أسود','#000000',10),('white','White','أبيض','#ffffff',20),
    ('red','Red','أحمر','#e11d48',30),('blue','Blue','أزرق','#2563eb',40),
    ('green','Green','أخضر','#16a34a',50),('grey','Grey','رمادي','#6b7280',60),
    ('beige','Beige','بيج','#d9c5a0',70)
  ) AS v(code, name, name_ar, hex, sort)
  WHERE NOT EXISTS (SELECT 1 FROM erp_fashion_colors e WHERE e.company_id = p_company_id AND e.code = v.code);

  INSERT INTO erp_fashion_seasons (company_id, code, name, name_ar)
  SELECT p_company_id, v.code, v.name, v.name_ar FROM (VALUES
    ('all','All Season','كل المواسم'),('summer','Summer','صيفي'),
    ('winter','Winter','شتوي'),('spring','Spring','ربيعي'),('autumn','Autumn','خريفي')
  ) AS v(code, name, name_ar)
  WHERE NOT EXISTS (SELECT 1 FROM erp_fashion_seasons e WHERE e.company_id = p_company_id AND e.code = v.code);
END $$;
REVOKE ALL ON FUNCTION erp_seed_fashion_lookups(UUID) FROM public;
GRANT EXECUTE ON FUNCTION erp_seed_fashion_lookups(UUID) TO authenticated, service_role;

-- Backfill existing clothing companies + seed new ones on creation.
DO $$ DECLARE c RECORD; BEGIN
  FOR c IN SELECT id FROM erp_companies WHERE business_type = 'clothing' LOOP
    PERFORM erp_seed_fashion_lookups(c.id);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION erp_seed_fashion_lookups_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.business_type = 'clothing' THEN PERFORM erp_seed_fashion_lookups(NEW.id); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS erp_companies_seed_fashion ON erp_companies;
CREATE TRIGGER erp_companies_seed_fashion AFTER INSERT ON erp_companies
  FOR EACH ROW EXECUTE FUNCTION erp_seed_fashion_lookups_trg();

-- ── Helper: resolve (or lazily create) the per-company walk-in cash customer ──
CREATE OR REPLACE FUNCTION erp_fashion_walkin_customer(p_branch_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_co UUID := erp_user_company_id(); v_id UUID;
BEGIN
  SELECT id INTO v_id FROM erp_customers WHERE company_id = v_co AND code = 'WALKIN' LIMIT 1;
  IF v_id IS NULL THEN
    -- Only base erp_customers columns. `approval_status` belongs to a separate
    -- (customer-approval) migration that may not be applied in every environment;
    -- the base `is_approved` flag is sufficient for the walk-in cash customer.
    INSERT INTO erp_customers (company_id, code, name, name_ar, branch_id, credit_limit, balance, is_active, is_approved)
    VALUES (v_co, 'WALKIN', 'Walk-in Customer', 'عميل نقدي', p_branch_id, 0, 0, true, true)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION erp_fashion_walkin_customer(UUID) FROM public;
GRANT EXECUTE ON FUNCTION erp_fashion_walkin_customer(UUID) TO authenticated, service_role;

-- ── Checkout: one atomic cash OR installment sale ───────────────────────────
-- p_lines = [{product_id, quantity, unit_price, discount_pct}]. Reuses
-- erp_issue_invoice() (stock-out + AR journal + balance) and erp_record_payment()
-- (cash journal + balance). For installment it records the optional down payment
-- and builds the schedule. Returns the new invoice id.
CREATE OR REPLACE FUNCTION erp_fashion_checkout(
  p_branch_id UUID,
  p_customer_id UUID,
  p_lines JSONB,
  p_discount NUMERIC DEFAULT 0,
  p_sale_type TEXT DEFAULT 'cash',            -- 'cash' | 'installment'
  p_down_payment NUMERIC DEFAULT 0,
  p_installment_count INTEGER DEFAULT 1,
  p_frequency TEXT DEFAULT 'monthly',
  p_start_date DATE DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_co UUID := erp_user_company_id();
  v_uid UUID := auth.uid();
  v_cust UUID := p_customer_id;
  v_inv UUID;
  v_num TEXT;
  v_total NUMERIC := 0;
  v_disc NUMERIC := GREATEST(COALESCE(p_discount,0), 0);
  v_net NUMERIC;
  v_line JSONB;
  v_qty NUMERIC; v_price NUMERIC; v_dpct NUMERIC; v_ltot NUMERIC;
  v_financed NUMERIC; v_down NUMERIC; v_plan UUID;
  v_interval INTERVAL; v_each NUMERIC; v_acc NUMERIC := 0; v_amt NUMERIC; i INTEGER;
  v_start DATE := COALESCE(p_start_date, CURRENT_DATE);
  v_sess UUID;
BEGIN
  IF v_co IS NULL THEN RAISE EXCEPTION 'لا توجد شركة مرتبطة.'; END IF;
  IF p_branch_id IS NULL THEN RAISE EXCEPTION 'اختر فرعًا.'; END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'أضِف صنفًا واحدًا على الأقل.';
  END IF;
  IF p_sale_type = 'installment' AND p_customer_id IS NULL THEN
    RAISE EXCEPTION 'اختر عميلاً للبيع بالتقسيط.';
  END IF;

  IF v_cust IS NULL THEN v_cust := erp_fashion_walkin_customer(p_branch_id); END IF;

  -- total from lines
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_qty := COALESCE((v_line->>'quantity')::numeric, 0);
    v_price := COALESCE((v_line->>'unit_price')::numeric, 0);
    v_dpct := COALESCE((v_line->>'discount_pct')::numeric, 0);
    v_total := v_total + (v_qty * v_price * (1 - v_dpct/100.0));
  END LOOP;
  v_net := GREATEST(v_total - LEAST(v_disc, v_total), 0);

  v_num := erp_next_number(p_branch_id, 'invoice');
  INSERT INTO erp_invoices (branch_id, customer_id, invoice_number, status, total_amount, discount_amount, tax_amount, net_amount, paid_amount, created_by)
  VALUES (p_branch_id, v_cust, v_num, 'draft', v_total, LEAST(v_disc, v_total), 0, v_net, 0, v_uid)
  RETURNING id INTO v_inv;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_qty := COALESCE((v_line->>'quantity')::numeric, 0);
    v_price := COALESCE((v_line->>'unit_price')::numeric, 0);
    v_dpct := COALESCE((v_line->>'discount_pct')::numeric, 0);
    v_ltot := v_qty * v_price * (1 - v_dpct/100.0);
    INSERT INTO erp_invoice_lines (invoice_id, product_id, quantity, unit_price, discount_pct, line_total)
    VALUES (v_inv, (v_line->>'product_id')::uuid, v_qty, v_price, v_dpct, v_ltot);
  END LOOP;

  -- stock-out + AR journal + customer balance
  PERFORM erp_issue_invoice(v_inv);

  -- open cash session for this branch (for the cash-box ledger), if any
  SELECT id INTO v_sess FROM erp_cash_sessions WHERE company_id = v_co AND branch_id = p_branch_id AND status = 'open' LIMIT 1;

  IF p_sale_type = 'cash' THEN
    PERFORM erp_record_payment(v_inv, v_net, 'cash'::erp_payment_method, NULL, CURRENT_DATE, gen_random_uuid());
    IF v_sess IS NOT NULL AND v_net > 0 THEN
      INSERT INTO erp_cash_movements (company_id, session_id, kind, amount, reference_type, reference_id, note, created_by)
      VALUES (v_co, v_sess, 'sale', v_net, 'invoice', v_inv, v_num, v_uid);
    END IF;
  ELSE
    v_down := LEAST(GREATEST(COALESCE(p_down_payment,0),0), v_net);
    IF v_down > 0 THEN
      PERFORM erp_record_payment(v_inv, v_down, 'cash'::erp_payment_method, 'down', CURRENT_DATE, gen_random_uuid());
      IF v_sess IS NOT NULL THEN
        INSERT INTO erp_cash_movements (company_id, session_id, kind, amount, reference_type, reference_id, note, created_by)
        VALUES (v_co, v_sess, 'sale', v_down, 'invoice', v_inv, v_num, v_uid);
      END IF;
    END IF;
    v_financed := GREATEST(v_net - v_down, 0);
    INSERT INTO erp_installment_plans (company_id, branch_id, invoice_id, customer_id, total_amount, down_payment, financed_amount, installment_count, frequency, start_date, status, created_by)
    VALUES (v_co, p_branch_id, v_inv, v_cust, v_net, v_down, v_financed, GREATEST(p_installment_count,1),
            CASE WHEN p_frequency IN ('weekly','biweekly','monthly') THEN p_frequency ELSE 'monthly' END, v_start, 'active', v_uid)
    RETURNING id INTO v_plan;

    v_interval := CASE WHEN p_frequency = 'weekly' THEN INTERVAL '7 days'
                       WHEN p_frequency = 'biweekly' THEN INTERVAL '14 days'
                       ELSE INTERVAL '1 month' END;
    v_each := round((v_financed / GREATEST(p_installment_count,1))::numeric, 2);
    FOR i IN 1..GREATEST(p_installment_count,1) LOOP
      IF i = GREATEST(p_installment_count,1) THEN v_amt := round((v_financed - v_acc)::numeric, 2);
      ELSE v_amt := v_each; v_acc := v_acc + v_each; END IF;
      INSERT INTO erp_installment_schedule (company_id, plan_id, seq_no, due_date, amount)
      VALUES (v_co, v_plan, i, (v_start + (v_interval * (i-1)))::date, v_amt);
    END LOOP;
  END IF;

  RETURN jsonb_build_object('invoice_id', v_inv, 'invoice_number', v_num, 'net', v_net,
    'sale_type', p_sale_type, 'plan_id', v_plan);
END $$;
REVOKE ALL ON FUNCTION erp_fashion_checkout(UUID,UUID,JSONB,NUMERIC,TEXT,NUMERIC,INTEGER,TEXT,DATE) FROM public;
GRANT EXECUTE ON FUNCTION erp_fashion_checkout(UUID,UUID,JSONB,NUMERIC,TEXT,NUMERIC,INTEGER,TEXT,DATE) TO authenticated, service_role;

-- ── Collect an installment ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION erp_fashion_collect_installment(
  p_schedule_id UUID, p_amount NUMERIC, p_method TEXT DEFAULT 'cash'
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_co UUID := erp_user_company_id(); v_uid UUID := auth.uid();
  v_sched erp_installment_schedule; v_plan erp_installment_plans;
  v_amt NUMERIC; v_remaining NUMERIC; v_sess UUID; v_open_count INT;
BEGIN
  SELECT * INTO v_sched FROM erp_installment_schedule WHERE id = p_schedule_id FOR UPDATE;
  IF v_sched.id IS NULL THEN RAISE EXCEPTION 'القسط غير موجود.'; END IF;
  IF NOT (erp_is_platform_owner() OR v_sched.company_id = v_co) THEN RAISE EXCEPTION 'غير مصرح.'; END IF;
  SELECT * INTO v_plan FROM erp_installment_plans WHERE id = v_sched.plan_id;

  v_remaining := GREATEST(v_sched.amount - v_sched.paid_amount, 0);
  v_amt := LEAST(GREATEST(COALESCE(p_amount,0),0), v_remaining);
  IF v_amt <= 0 THEN RAISE EXCEPTION 'المبلغ يجب أن يكون أكبر من صفر.'; END IF;

  -- record against the invoice (cash journal + invoice paid + customer balance)
  IF v_plan.invoice_id IS NOT NULL THEN
    PERFORM erp_record_payment(v_plan.invoice_id, v_amt,
      (CASE WHEN p_method = 'card' THEN 'credit_card' ELSE 'cash' END)::erp_payment_method,
      'installment', CURRENT_DATE, gen_random_uuid());
  END IF;

  UPDATE erp_installment_schedule
    SET paid_amount = paid_amount + v_amt,
        status = CASE WHEN paid_amount + v_amt >= amount - 0.001 THEN 'paid' ELSE 'partial' END,
        paid_at = CASE WHEN paid_amount + v_amt >= amount - 0.001 THEN now() ELSE paid_at END
    WHERE id = p_schedule_id;

  INSERT INTO erp_installment_payments (company_id, plan_id, schedule_id, amount, method, received_by)
  VALUES (v_co, v_plan.id, p_schedule_id, v_amt, CASE WHEN p_method='card' THEN 'card' ELSE 'cash' END, v_uid);

  -- cash-box ledger
  SELECT id INTO v_sess FROM erp_cash_sessions WHERE company_id = v_co AND branch_id = v_plan.branch_id AND status = 'open' LIMIT 1;
  IF v_sess IS NOT NULL AND p_method <> 'card' THEN
    INSERT INTO erp_cash_movements (company_id, session_id, kind, amount, reference_type, reference_id, note, created_by)
    VALUES (v_co, v_sess, 'collection', v_amt, 'installment', v_plan.id, NULL, v_uid);
  END IF;

  -- complete the plan when nothing is left unpaid
  SELECT count(*) INTO v_open_count FROM erp_installment_schedule WHERE plan_id = v_plan.id AND status <> 'paid';
  IF v_open_count = 0 THEN UPDATE erp_installment_plans SET status = 'completed' WHERE id = v_plan.id; END IF;

  RETURN jsonb_build_object('schedule_id', p_schedule_id, 'amount', v_amt, 'plan_completed', (v_open_count = 0));
END $$;
REVOKE ALL ON FUNCTION erp_fashion_collect_installment(UUID,NUMERIC,TEXT) FROM public;
GRANT EXECUTE ON FUNCTION erp_fashion_collect_installment(UUID,NUMERIC,TEXT) TO authenticated, service_role;

-- ── Cash box: open / close ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION erp_fashion_open_cashbox(p_branch_id UUID, p_opening_float NUMERIC DEFAULT 0)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_co UUID := erp_user_company_id(); v_id UUID;
BEGIN
  IF v_co IS NULL THEN RAISE EXCEPTION 'لا توجد شركة.'; END IF;
  IF EXISTS (SELECT 1 FROM erp_cash_sessions WHERE company_id = v_co AND branch_id = p_branch_id AND status = 'open') THEN
    RAISE EXCEPTION 'يوجد صندوق مفتوح بالفعل لهذا الفرع.';
  END IF;
  INSERT INTO erp_cash_sessions (company_id, branch_id, opened_by, opening_float, status)
  VALUES (v_co, p_branch_id, auth.uid(), GREATEST(COALESCE(p_opening_float,0),0), 'open')
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION erp_fashion_open_cashbox(UUID,NUMERIC) FROM public;
GRANT EXECUTE ON FUNCTION erp_fashion_open_cashbox(UUID,NUMERIC) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION erp_fashion_close_cashbox(p_session_id UUID, p_counted NUMERIC)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_co UUID := erp_user_company_id(); s erp_cash_sessions; v_expected NUMERIC; v_in NUMERIC; v_out NUMERIC;
BEGIN
  SELECT * INTO s FROM erp_cash_sessions WHERE id = p_session_id FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'الصندوق غير موجود.'; END IF;
  IF NOT (erp_is_platform_owner() OR s.company_id = v_co) THEN RAISE EXCEPTION 'غير مصرح.'; END IF;
  IF s.status = 'closed' THEN RAISE EXCEPTION 'الصندوق مغلق بالفعل.'; END IF;

  SELECT COALESCE(SUM(amount) FILTER (WHERE kind IN ('sale','collection','payin')), 0),
         COALESCE(SUM(amount) FILTER (WHERE kind IN ('expense','supplier_payment','payout')), 0)
    INTO v_in, v_out FROM erp_cash_movements WHERE session_id = p_session_id;
  v_expected := s.opening_float + v_in - v_out;

  UPDATE erp_cash_sessions
    SET status = 'closed', closing_counted = COALESCE(p_counted, 0),
        expected_amount = v_expected, variance = COALESCE(p_counted,0) - v_expected,
        closed_by = auth.uid(), closed_at = now()
    WHERE id = p_session_id;

  RETURN jsonb_build_object('expected', v_expected, 'counted', COALESCE(p_counted,0), 'variance', COALESCE(p_counted,0) - v_expected);
END $$;
REVOKE ALL ON FUNCTION erp_fashion_close_cashbox(UUID,NUMERIC) FROM public;
GRANT EXECUTE ON FUNCTION erp_fashion_close_cashbox(UUID,NUMERIC) TO authenticated, service_role;

-- ── Expense (posts a journal: Debit expense / Credit cash|bank) ─────────────
CREATE OR REPLACE FUNCTION erp_fashion_add_expense(
  p_branch_id UUID, p_category TEXT, p_amount NUMERIC, p_paid_from TEXT DEFAULT 'cash', p_note TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_co UUID := erp_user_company_id(); v_uid UUID := auth.uid();
  v_exp UUID; v_acc_exp UUID; v_acc_cash UUID; v_entry UUID; v_sess UUID; v_amt NUMERIC := GREATEST(COALESCE(p_amount,0),0);
BEGIN
  IF v_co IS NULL THEN RAISE EXCEPTION 'لا توجد شركة.'; END IF;
  IF v_amt <= 0 THEN RAISE EXCEPTION 'المبلغ يجب أن يكون أكبر من صفر.'; END IF;

  INSERT INTO erp_expenses (company_id, branch_id, category, amount, paid_from, note, created_by)
  VALUES (v_co, p_branch_id, p_category, v_amt, CASE WHEN p_paid_from='bank' THEN 'bank' ELSE 'cash' END, p_note, v_uid)
  RETURNING id INTO v_exp;

  -- journal: Debit "Other Expenses" (5990) / Credit Cash on hand (1100) or Bank (1120)
  SELECT id INTO v_acc_exp FROM erp_chart_of_accounts WHERE code = '5990' AND is_system LIMIT 1;
  SELECT id INTO v_acc_cash FROM erp_chart_of_accounts WHERE code = CASE WHEN p_paid_from='bank' THEN '1120' ELSE '1100' END AND is_system LIMIT 1;
  IF p_branch_id IS NOT NULL AND v_acc_exp IS NOT NULL AND v_acc_cash IS NOT NULL THEN
    INSERT INTO erp_journal_entries (entry_number, entry_date, description, reference_type, reference_id, branch_id, status, created_by, posted_by, posted_at)
    VALUES (erp_next_number(p_branch_id,'journal'), CURRENT_DATE, COALESCE(p_category,'مصروف'), 'fashion_expense', v_exp, p_branch_id, 'posted', v_uid, v_uid, now())
    RETURNING id INTO v_entry;
    INSERT INTO erp_journal_lines (journal_entry_id, account_id, debit, credit) VALUES
      (v_entry, v_acc_exp, v_amt, 0), (v_entry, v_acc_cash, 0, v_amt);
  END IF;

  -- cash-box ledger
  IF p_paid_from <> 'bank' THEN
    SELECT id INTO v_sess FROM erp_cash_sessions WHERE company_id = v_co AND branch_id = p_branch_id AND status = 'open' LIMIT 1;
    IF v_sess IS NOT NULL THEN
      INSERT INTO erp_cash_movements (company_id, session_id, kind, amount, reference_type, reference_id, note, created_by)
      VALUES (v_co, v_sess, 'expense', v_amt, 'fashion_expense', v_exp, p_category, v_uid);
    END IF;
  END IF;
  RETURN v_exp;
END $$;
REVOKE ALL ON FUNCTION erp_fashion_add_expense(UUID,TEXT,NUMERIC,TEXT,TEXT) FROM public;
GRANT EXECUTE ON FUNCTION erp_fashion_add_expense(UUID,TEXT,NUMERIC,TEXT,TEXT) TO authenticated, service_role;

-- ── Supplier payment (Debit AP 2100 / Credit Cash 1100; reduces balance) ────
-- Dedicated fashion RPC (NOT a global trigger) so FMCG supplier-payment behavior
-- is unchanged.
CREATE OR REPLACE FUNCTION erp_fashion_pay_supplier(
  p_branch_id UUID, p_supplier_id UUID, p_amount NUMERIC, p_method TEXT DEFAULT 'cash', p_note TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_co UUID := erp_user_company_id(); v_uid UUID := auth.uid();
  v_pay UUID; v_acc_ap UUID; v_acc_cash UUID; v_entry UUID; v_sess UUID;
  v_amt NUMERIC := GREATEST(COALESCE(p_amount,0),0); v_scompany UUID;
BEGIN
  IF v_co IS NULL THEN RAISE EXCEPTION 'لا توجد شركة.'; END IF;
  IF v_amt <= 0 THEN RAISE EXCEPTION 'المبلغ يجب أن يكون أكبر من صفر.'; END IF;
  SELECT company_id INTO v_scompany FROM erp_suppliers WHERE id = p_supplier_id;
  IF v_scompany IS NULL OR (NOT erp_is_platform_owner() AND v_scompany <> v_co) THEN RAISE EXCEPTION 'المورد غير موجود.'; END IF;

  INSERT INTO erp_supplier_payments (supplier_id, amount, payment_method, reference_number, payment_date, created_by)
  VALUES (p_supplier_id, v_amt, (CASE WHEN p_method='bank' THEN 'bank_transfer' ELSE 'cash' END)::erp_payment_method, p_note, CURRENT_DATE, v_uid)
  RETURNING id INTO v_pay;

  UPDATE erp_suppliers SET balance = balance - v_amt WHERE id = p_supplier_id;

  SELECT id INTO v_acc_ap FROM erp_chart_of_accounts WHERE code = '2100' AND is_system LIMIT 1;
  SELECT id INTO v_acc_cash FROM erp_chart_of_accounts WHERE code = CASE WHEN p_method='bank' THEN '1120' ELSE '1100' END AND is_system LIMIT 1;
  IF p_branch_id IS NOT NULL AND v_acc_ap IS NOT NULL AND v_acc_cash IS NOT NULL THEN
    INSERT INTO erp_journal_entries (entry_number, entry_date, description, reference_type, reference_id, branch_id, status, created_by, posted_by, posted_at)
    VALUES (erp_next_number(p_branch_id,'journal'), CURRENT_DATE, 'سداد لمورد', 'supplier_payment', v_pay, p_branch_id, 'posted', v_uid, v_uid, now())
    RETURNING id INTO v_entry;
    INSERT INTO erp_journal_lines (journal_entry_id, account_id, debit, credit) VALUES
      (v_entry, v_acc_ap, v_amt, 0), (v_entry, v_acc_cash, 0, v_amt);
  END IF;

  IF p_method <> 'bank' THEN
    SELECT id INTO v_sess FROM erp_cash_sessions WHERE company_id = v_co AND branch_id = p_branch_id AND status = 'open' LIMIT 1;
    IF v_sess IS NOT NULL THEN
      INSERT INTO erp_cash_movements (company_id, session_id, kind, amount, reference_type, reference_id, note, created_by)
      VALUES (v_co, v_sess, 'supplier_payment', v_amt, 'supplier_payment', v_pay, p_note, v_uid);
    END IF;
  END IF;
  RETURN v_pay;
END $$;
REVOKE ALL ON FUNCTION erp_fashion_pay_supplier(UUID,UUID,NUMERIC,TEXT,TEXT) FROM public;
GRANT EXECUTE ON FUNCTION erp_fashion_pay_supplier(UUID,UUID,NUMERIC,TEXT,TEXT) TO authenticated, service_role;

-- ── Purchase (stock-in + AP; optional cash settlement) ─────────────────────
-- p_lines = [{product_id, quantity, unit_cost}]. Raises inventory (purchase_in
-- movements → stock trigger), increases the supplier payable, posts Debit
-- Inventory(1300) / Credit AP(2100); when p_pay_cash it immediately settles via
-- erp_fashion_pay_supplier (so AP nets to zero and cash falls).
CREATE OR REPLACE FUNCTION erp_fashion_purchase(
  p_branch_id UUID, p_supplier_id UUID, p_warehouse_id UUID, p_lines JSONB, p_pay_cash BOOLEAN DEFAULT false
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_co UUID := erp_user_company_id(); v_uid UUID := auth.uid();
  v_wh UUID := p_warehouse_id; v_total NUMERIC := 0; v_line JSONB; v_qty NUMERIC; v_cost NUMERIC;
  v_acc_inv UUID; v_acc_ap UUID; v_entry UUID; v_scompany UUID;
BEGIN
  IF v_co IS NULL THEN RAISE EXCEPTION 'لا توجد شركة.'; END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN RAISE EXCEPTION 'أضِف صنفًا واحدًا على الأقل.'; END IF;
  SELECT company_id INTO v_scompany FROM erp_suppliers WHERE id = p_supplier_id;
  IF v_scompany IS NULL OR (NOT erp_is_platform_owner() AND v_scompany <> v_co) THEN RAISE EXCEPTION 'المورد غير موجود.'; END IF;

  IF v_wh IS NULL THEN
    SELECT id INTO v_wh FROM erp_warehouses WHERE branch_id = p_branch_id AND is_active AND NOT is_van ORDER BY code LIMIT 1;
    IF v_wh IS NULL THEN SELECT id INTO v_wh FROM erp_warehouses WHERE branch_id = p_branch_id AND is_active ORDER BY code LIMIT 1; END IF;
  END IF;
  IF v_wh IS NULL THEN RAISE EXCEPTION 'لا يوجد مخزن لهذا الفرع.'; END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_qty := COALESCE((v_line->>'quantity')::numeric, 0);
    v_cost := COALESCE((v_line->>'unit_cost')::numeric, 0);
    IF v_qty > 0 THEN
      INSERT INTO erp_stock_movements (movement_type, warehouse_id, product_id, quantity, reference_type, reference_id, notes, created_by)
      VALUES ('purchase_in', v_wh, (v_line->>'product_id')::uuid, abs(v_qty), 'fashion_purchase', NULL, 'شراء', v_uid);
      v_total := v_total + abs(v_qty) * v_cost;
    END IF;
  END LOOP;

  UPDATE erp_suppliers SET balance = balance + v_total WHERE id = p_supplier_id;

  SELECT id INTO v_acc_inv FROM erp_chart_of_accounts WHERE code = '1300' AND is_system LIMIT 1;
  SELECT id INTO v_acc_ap FROM erp_chart_of_accounts WHERE code = '2100' AND is_system LIMIT 1;
  IF p_branch_id IS NOT NULL AND v_acc_inv IS NOT NULL AND v_acc_ap IS NOT NULL AND v_total > 0 THEN
    INSERT INTO erp_journal_entries (entry_number, entry_date, description, reference_type, reference_id, branch_id, status, created_by, posted_by, posted_at)
    VALUES (erp_next_number(p_branch_id,'journal'), CURRENT_DATE, 'فاتورة شراء', 'fashion_purchase', p_supplier_id, p_branch_id, 'posted', v_uid, v_uid, now())
    RETURNING id INTO v_entry;
    INSERT INTO erp_journal_lines (journal_entry_id, account_id, debit, credit) VALUES
      (v_entry, v_acc_inv, v_total, 0), (v_entry, v_acc_ap, 0, v_total);
  END IF;

  IF p_pay_cash AND v_total > 0 THEN
    PERFORM erp_fashion_pay_supplier(p_branch_id, p_supplier_id, v_total, 'cash', 'سداد فوري للشراء');
  END IF;

  RETURN jsonb_build_object('warehouse_id', v_wh, 'total', v_total, 'paid_cash', p_pay_cash);
END $$;
REVOKE ALL ON FUNCTION erp_fashion_purchase(UUID,UUID,UUID,JSONB,BOOLEAN) FROM public;
GRANT EXECUTE ON FUNCTION erp_fashion_purchase(UUID,UUID,UUID,JSONB,BOOLEAN) TO authenticated, service_role;

-- ── Module / permission / business-type wiring (clothing only) ──────────────
INSERT INTO erp_role_permissions (role_key, permission) VALUES
  ('admin','fashion.manage'),('manager','fashion.manage'),
  ('admin','fashion.sell'),('admin','fashion.inventory'),('admin','fashion.purchase'),
  ('admin','fashion.installments'),('admin','fashion.cashbox'),('admin','fashion.reports'),
  ('cashier','fashion.sell'),('cashier','fashion.installments'),('cashier','fashion.cashbox'),
  ('accountant','fashion.reports'),('accountant','fashion.cashbox'),('accountant','fashion.installments'),('accountant','fashion.purchase'),
  ('warehouse_keeper','fashion.inventory'),('warehouse_keeper','fashion.purchase')
ON CONFLICT DO NOTHING;

-- Clothing role template (which roles a new clothing company enables by default).
INSERT INTO erp_business_type_roles (business_type, role_key) VALUES
  ('clothing','admin'),('clothing','manager'),('clothing','accountant'),
  ('clothing','cashier'),('clothing','warehouse_keeper'),('clothing','viewer')
ON CONFLICT (business_type, role_key) DO NOTHING;

-- Clothing sees ONLY the fashion nav module (FMCG/generic sections stay hidden).
INSERT INTO erp_business_type_modules (business_type, module) VALUES ('clothing','fashion')
ON CONFLICT (business_type, module) DO NOTHING;
INSERT INTO erp_plan_modules (plan_key, module) SELECT key, 'fashion' FROM erp_plans
ON CONFLICT (plan_key, module) DO NOTHING;
INSERT INTO erp_company_modules (company_id, module, enabled)
SELECT id, 'fashion', true FROM erp_companies WHERE business_type = 'clothing'
ON CONFLICT (company_id, module) DO NOTHING;

-- Grant the fashion capabilities to existing clothing companies' enabled roles.
INSERT INTO erp_company_role_permissions (company_id, role_key, permission)
SELECT cr.company_id, cr.role_key, g.permission
FROM erp_company_roles cr
JOIN erp_companies c ON c.id = cr.company_id
JOIN (VALUES
  ('admin','fashion.manage'),('admin','fashion.sell'),('admin','fashion.inventory'),('admin','fashion.purchase'),
  ('admin','fashion.installments'),('admin','fashion.cashbox'),('admin','fashion.reports'),
  ('manager','fashion.manage'),
  ('cashier','fashion.sell'),('cashier','fashion.installments'),('cashier','fashion.cashbox'),
  ('accountant','fashion.reports'),('accountant','fashion.cashbox'),('accountant','fashion.installments'),('accountant','fashion.purchase'),
  ('warehouse_keeper','fashion.inventory'),('warehouse_keeper','fashion.purchase')
) AS g(role_key, permission) ON g.role_key = cr.role_key
WHERE c.business_type = 'clothing' AND cr.enabled
ON CONFLICT DO NOTHING;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP the erp_fashion_* / erp_installment_* / erp_cash_* / erp_expenses tables and
-- the erp_fashion_* functions; DELETE the fashion.* permission rows; remove the
-- ('clothing','fashion') business_type_modules row. No shared table is altered.
