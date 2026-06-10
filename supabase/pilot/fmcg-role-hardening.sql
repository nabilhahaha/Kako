-- ============================================================================
-- VANTORA — FMCG role hardening for the pilot reference company.
-- ----------------------------------------------------------------------------
-- Refines four FMCG roles on a single tenant WITHOUT touching global defaults
-- or any other company. Idempotent and company-scoped. Applied + verified on
-- `vantora-staging` (Nile FMCG Distribution Group); kept here so the hardening
-- is reproducible on any environment.
--
--   1. Merchandiser        — assortment/survey/grade; NO selling/collection.
--   2. Cash Van            — cash sell + collect; NO credit (perm + DB guard).
--   3. Van Sales Rep       — cash + credit selling (salesman + sales.credit).
--   4. Collection Officer  — collect only; NO selling.
--   5. Credit Controller   — credit.request.approve; NO journal posting.
--
-- Mechanism: erp_user_has_permission() prefers company-scoped grants in
-- erp_company_role_permissions over the global erp_role_permissions, so these
-- grants only affect THIS company.
--
-- USAGE: set :company_name (defaults to the pilot company) and run once.
-- ============================================================================
\set ON_ERROR_STOP on
\if :{?company_name} \else \set company_name 'Nile FMCG Distribution Group' \endif

DO $hardening$
DECLARE
  v_co uuid;
BEGIN
  SELECT id INTO v_co FROM erp_companies WHERE name = :'company_name';
  IF v_co IS NULL THEN
    RAISE EXCEPTION 'Company % not found', :'company_name';
  END IF;

  -- 1) Register the refined roles (company-usable, non-system). Idempotent.
  INSERT INTO erp_roles (role_key, name, is_system)
  VALUES
    ('merchandiser',      'Merchandiser',       false),
    ('cash_van',          'Cash Van Rep',       false),
    ('collection_officer','Collection Officer', false),
    ('credit_controller', 'Credit Controller',  false)
  ON CONFLICT (role_key) DO NOTHING;

  -- 2) Company-scoped permission sets (delete + reseed → idempotent).
  DELETE FROM erp_company_role_permissions
   WHERE company_id = v_co
     AND role_key IN ('merchandiser','cash_van','salesman','collection_officer','credit_controller');

  INSERT INTO erp_company_role_permissions (company_id, role_key, permission)
  SELECT v_co, role_key, permission FROM (VALUES
    -- Merchandiser: assortment/survey/grade; NO sales.sell/collect/credit.
    ('merchandiser','assortment.manage'),('merchandiser','survey.manage'),
    ('merchandiser','grade.manage'),('merchandiser','field.sales'),
    ('merchandiser','field.attach_media'),('merchandiser','journey.create'),
    ('merchandiser','customers.manage'),('merchandiser','customer.create'),
    ('merchandiser','inventory.view'),('merchandiser','stock.view'),
    ('merchandiser','product.search'),('merchandiser','pricing.view'),
    ('merchandiser','day.close'),('merchandiser','reconciliation.view'),
    ('merchandiser','target.view'),('merchandiser','report.aggregate.view'),
    -- Cash Van: cash sell + collect; NO sales.credit / credit.request.create.
    ('cash_van','sales.sell'),('cash_van','sales.collect'),
    ('cash_van','field.sales'),('cash_van','field.attach_media'),
    ('cash_van','customers.manage'),('cash_van','customer.create'),
    ('cash_van','inventory.view'),('cash_van','stock.view'),
    ('cash_van','stock.transfer'),('cash_van','stock_request.create'),
    ('cash_van','product.search'),('cash_van','pricing.view'),
    ('cash_van','day.close'),('cash_van','reconciliation.view'),
    ('cash_van','target.view'),('cash_van','report.aggregate.view'),
    -- Van Sales Rep: cash_van set + credit selling.
    ('salesman','sales.sell'),('salesman','sales.collect'),
    ('salesman','sales.credit'),('salesman','credit.request.create'),
    ('salesman','field.sales'),('salesman','field.attach_media'),
    ('salesman','customers.manage'),('salesman','customer.create'),
    ('salesman','inventory.view'),('salesman','stock.view'),
    ('salesman','stock.transfer'),('salesman','stock_request.create'),
    ('salesman','product.search'),('salesman','pricing.view'),
    ('salesman','day.close'),('salesman','reconciliation.view'),
    ('salesman','target.view'),('salesman','report.aggregate.view'),
    -- Collection Officer: collect only; NO sales.sell.
    ('collection_officer','sales.collect'),('collection_officer','customers.manage'),
    ('collection_officer','customers.change_status'),('collection_officer','pricing.view'),
    ('collection_officer','report.aggregate.view'),
    -- Credit Controller: approve credit; NO accounting.post.
    ('credit_controller','credit.request.approve'),('credit_controller','credit.request.create'),
    ('credit_controller','accounting.view'),('credit_controller','accounting.voucher.approve'),
    ('credit_controller','sales.collect'),('credit_controller','suppliers.manage'),
    ('credit_controller','customers.change_status'),('credit_controller','reports.view'),
    ('credit_controller','report.aggregate.view')
  ) AS g(role_key, permission);

  -- 3) Remap the 30 affected users to the refined roles (by demo-email pattern).
  UPDATE erp_user_branches ub SET role = 'merchandiser'
    FROM erp_branches b, erp_profiles p
   WHERE b.id = ub.branch_id AND b.company_id = v_co
     AND p.id = ub.user_id AND p.email ~ '^merch[0-9]+@';
  UPDATE erp_user_branches ub SET role = 'cash_van'
    FROM erp_branches b, erp_profiles p
   WHERE b.id = ub.branch_id AND b.company_id = v_co
     AND p.id = ub.user_id AND p.email ~ '^cash\.van[0-9]+@';
  UPDATE erp_user_branches ub SET role = 'collection_officer'
    FROM erp_branches b, erp_profiles p
   WHERE b.id = ub.branch_id AND b.company_id = v_co
     AND p.id = ub.user_id AND p.email LIKE 'collection.officer@%';
  UPDATE erp_user_branches ub SET role = 'credit_controller'
    FROM erp_branches b, erp_profiles p
   WHERE b.id = ub.branch_id AND b.company_id = v_co
     AND p.id = ub.user_id AND p.email LIKE 'credit.controller@%';
END $hardening$;

-- 4) Defence-in-depth: block cash-van users from creating credit (future-due)
--    invoices at the database layer, regardless of the UI.
CREATE OR REPLACE FUNCTION public.erp_demo_cash_van_credit_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $guard$
DECLARE v_co2 uuid;
BEGIN
  IF new.due_date IS NOT NULL AND new.due_date > current_date THEN
    SELECT b.company_id INTO v_co2 FROM erp_branches b WHERE b.id = new.branch_id;
    IF EXISTS (SELECT 1 FROM erp_user_branches ub JOIN erp_branches bb ON bb.id = ub.branch_id
               WHERE ub.user_id = auth.uid() AND bb.company_id = v_co2 AND ub.role = 'cash_van') THEN
      RAISE EXCEPTION 'Cash Van representatives cannot create credit invoices (future due date). Cash sales only.';
    END IF;
  END IF;
  RETURN new;
END $guard$;

DROP TRIGGER IF EXISTS erp_demo_cash_van_credit_guard ON public.erp_invoices;
CREATE TRIGGER erp_demo_cash_van_credit_guard
  BEFORE INSERT ON public.erp_invoices
  FOR EACH ROW EXECUTE FUNCTION public.erp_demo_cash_van_credit_guard();
