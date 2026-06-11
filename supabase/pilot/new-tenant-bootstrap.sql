-- ============================================================================
-- VANTORA — NEW TENANT BOOTSTRAP (empty FMCG shell, coexists with the demo)
-- ----------------------------------------------------------------------------
-- Creates a NEW, EMPTY company alongside any existing tenants (e.g. the
-- "Nile FMCG (DEMO)" reference tenant) — no deletion, full RLS isolation,
-- tenant-scoped document numbering (migration 0268).
--
-- It provisions ONLY the tenant shell:
--   • the company row + van-sales/fmcg settings + return reasons
--   • the 4 refined FMCG roles' COMPANY-SCOPED permissions (required: these
--     roles have NO global defaults, so a new tenant must seed them) + the
--     salesman cash+credit override
-- It does NOT create branches/warehouses/users/products/customers — load those
-- from docs/onboarding/templates/*.csv via the in-app importer (or SQL).
-- The cash-van credit-guard trigger is a GLOBAL object already present.
--
-- Idempotent on company NAME. Safe to run on a populated multi-tenant DB.
--
-- HOW TO RUN: edit the v_* values below, then run once (psql / Supabase SQL
-- editor / MCP). Re-running once the company exists is a no-op.
-- ============================================================================
DO $bootstrap$
DECLARE
  -- ░░ EDIT THESE for the real customer ░░
  v_name     text := 'REPLACE Real Distributor Name';
  v_name_ar  text := 'REPLACE الاسم بالعربية';
  v_currency text := 'SAR';     -- e.g. SAR / EGP / AED
  v_country  text := 'SA';      -- ISO-2
  -- ░░ end edits ░░
  v_co uuid;
BEGIN
  SELECT id INTO v_co FROM erp_companies WHERE name = v_name;
  IF v_co IS NOT NULL THEN
    RAISE NOTICE 'Tenant "%" already exists (%). Nothing to do.', v_name, v_co;
    RETURN;
  END IF;
  IF v_name LIKE 'REPLACE %' THEN
    RAISE EXCEPTION 'Edit v_name/v_name_ar/v_currency/v_country before running.';
  END IF;

  INSERT INTO erp_companies(name, name_ar, currency, country, business_type)
    VALUES (v_name, v_name_ar, v_currency, v_country, 'fmcg')
    RETURNING id INTO v_co;

  INSERT INTO erp_van_sales_settings(company_id, is_enabled, discount_cap_pct, allow_negative_van_stock, require_physical_count_on_close)
    VALUES (v_co, true, 15, false, true);
  INSERT INTO erp_fmcg_settings(company_id) VALUES (v_co) ON CONFLICT DO NOTHING;
  INSERT INTO erp_return_reasons(company_id, code, label_en, label_ar) VALUES
    (v_co,'damaged','Damaged','تالف'),
    (v_co,'expired','Expired','منتهي الصلاحية'),
    (v_co,'wrong_item','Wrong item','صنف خاطئ'),
    (v_co,'customer_rejection','Customer rejection','رفض العميل'),
    (v_co,'overstock','Overstock','فائض مخزون')
  ON CONFLICT (company_id, code) DO NOTHING;

  -- Enable the modules a van-sales FMCG distributor needs. WITHOUT these, the
  -- nav (visibleSections) hides the field/van-sales/distribution/returns/
  -- warehousing screens, so reps/merchandisers/credit-controllers see almost
  -- nothing. (sales/inventory/purchasing/accounting alone are not enough.)
  INSERT INTO erp_company_modules(company_id, module, enabled)
  SELECT v_co, m, true FROM unnest(ARRAY[
    'sales','inventory','purchasing','accounting',
    'distribution','crm','analytics','warehousing','returns','integrations'
  ]) AS m
  WHERE NOT EXISTS (SELECT 1 FROM erp_company_modules cm WHERE cm.company_id=v_co AND cm.module=m);
  UPDATE erp_company_modules SET enabled=true
   WHERE company_id=v_co AND module IN ('sales','inventory','purchasing','accounting',
        'distribution','crm','analytics','warehousing','returns','integrations');

  -- Refined FMCG roles (global registry; idempotent) ...
  INSERT INTO erp_roles(key, name_ar, is_system, rank) VALUES
    ('merchandiser','منسق عرض',false,2),('cash_van','مندوب بيع نقدي',false,2),
    ('collection_officer','موظف تحصيل',false,3),('credit_controller','مراقب ائتمان',false,5)
  ON CONFLICT (key) DO NOTHING;

  -- ... and their COMPANY-SCOPED permissions for THIS tenant (required).
  INSERT INTO erp_company_role_permissions(company_id, role_key, permission)
  SELECT v_co, role_key, permission FROM (VALUES
    ('merchandiser','assortment.manage'),('merchandiser','survey.manage'),('merchandiser','grade.manage'),
    ('merchandiser','field.sales'),('merchandiser','field.attach_media'),('merchandiser','journey.create'),
    ('merchandiser','customers.manage'),('merchandiser','customer.create'),('merchandiser','inventory.view'),
    ('merchandiser','stock.view'),('merchandiser','product.search'),('merchandiser','pricing.view'),
    ('merchandiser','day.close'),('merchandiser','reconciliation.view'),('merchandiser','target.view'),
    ('merchandiser','report.aggregate.view'),
    ('cash_van','sales.sell'),('cash_van','sales.collect'),('cash_van','field.sales'),
    ('cash_van','field.attach_media'),('cash_van','customers.manage'),('cash_van','customer.create'),
    ('cash_van','inventory.view'),('cash_van','stock.view'),('cash_van','stock.transfer'),
    ('cash_van','stock_request.create'),('cash_van','product.search'),('cash_van','pricing.view'),
    ('cash_van','day.close'),('cash_van','reconciliation.view'),('cash_van','target.view'),
    ('cash_van','report.aggregate.view'),
    ('salesman','sales.sell'),('salesman','sales.collect'),('salesman','sales.credit'),
    ('salesman','credit.request.create'),('salesman','field.sales'),('salesman','field.attach_media'),
    ('salesman','customers.manage'),('salesman','customer.create'),('salesman','inventory.view'),
    ('salesman','stock.view'),('salesman','stock.transfer'),('salesman','stock_request.create'),
    ('salesman','product.search'),('salesman','pricing.view'),('salesman','day.close'),
    ('salesman','reconciliation.view'),('salesman','target.view'),('salesman','report.aggregate.view'),
    ('collection_officer','sales.collect'),('collection_officer','customers.manage'),
    ('collection_officer','customers.change_status'),('collection_officer','pricing.view'),
    ('collection_officer','report.aggregate.view'),
    ('credit_controller','credit.request.approve'),('credit_controller','credit.request.create'),
    ('credit_controller','accounting.view'),('credit_controller','accounting.voucher.approve'),
    ('credit_controller','sales.collect'),('credit_controller','suppliers.manage'),
    ('credit_controller','customers.change_status'),('credit_controller','reports.view'),
    ('credit_controller','report.aggregate.view')
  ) AS g(role_key, permission)
  ON CONFLICT (company_id, role_key, permission) DO NOTHING;

  -- GM ≠ Company Admin: the General Manager (manager) runs operations, NOT org
  -- governance. Seed a company-scoped manager override = global manager perms
  -- MINUS the governance set, so GM keeps all operations but loses staff/branch/
  -- field/integration administration (which stays with admin). Tenant-scoped only.
  INSERT INTO erp_company_role_permissions(company_id, role_key, permission)
  SELECT v_co, 'manager', rp.permission FROM erp_role_permissions rp
  WHERE rp.role_key='manager'
    AND rp.permission NOT IN ('settings.users','settings.branches','settings.custom_fields',
                              'integrations.manage','user.import','user.transfer','workflow.manage')
  ON CONFLICT (company_id, role_key, permission) DO NOTHING;

  RAISE NOTICE '════ NEW FMCG TENANT BOOTSTRAPPED ════';
  RAISE NOTICE 'company: % (%)', v_name, v_co;
  RAISE NOTICE 'next   : import branches → warehouses → products → suppliers → routes → customers → opening stock (docs/onboarding/templates), then invite users with refined roles.';
END $bootstrap$;
