-- ============================================================================
-- VANTORA — ENTERPRISE REFERENCE COMPANY (provisioning)
-- ----------------------------------------------------------------------------
-- Provisions the PERMANENT VANTORA reference tenant — "Nile FMCG Distribution
-- Group" — used for demos, testing, onboarding, training, pilot preparation, and
-- regression validation. One idempotent transaction (a DO block), keyed on the
-- company NAME: re-running once the company exists is a no-op.
--
-- Builds a realistic enterprise organization on the REAL schema + REAL RPCs:
--   • 12 departments, 20 job titles, teams
--   • 1 platform-owner identity + 19 company users across 3 branches
--   • Refined FMCG roles (no separate hardening step): Merchandiser
--     (assortment/survey/grade, no selling), Cash Van (cash sell+collect, no
--     credit — enforced by permission AND a DB guard), Collection Officer
--     (collect only), Credit Controller (credit approval, no journal posting),
--     Van Sales Rep (cash AND credit)
--   • Master data: categories, brands (product attribute), 18 SKUs, 5 suppliers,
--     price lists + items + rules, routes, 24 customers (credit limits, payment
--     terms, GPS, segments), return reasons, taxes (product tax_rate)
--   • Opening stock, purchase order + goods receipt, main→van transfers
-- Sample transactional activity (sell / collect / return / reconcile) and the
-- full role-by-role permission validation live in the companion file
-- reference-activity-and-validate.sql — run this file first, then that one.
--
-- ROLE MAPPING (organizational title → enforced BranchRole). The schema has no
-- "department" permission concept; authority is role-based. Titles/departments
-- are captured via erp_departments / erp_job_titles, and where two titles share a
-- role (Finance Manager/Accountant, Warehouse Manager/Keeper) they are
-- distinguished organizationally (department.manager_id + job title), NOT by a
-- different permission set. The refined FMCG roles (Merchandiser, Cash Van,
-- Collection Officer, Credit Controller) DO carry distinct company-scoped
-- permission sets, seeded below. See docs/architecture/fmcg/STAGING-FMCG-ROLE-HARDENING.md.
--
-- HOW TO RUN: dedicated demo/staging Supabase, KAKO_VAN_SALES=1, run this file.
-- ============================================================================
DO $$
DECLARE
  v_co uuid;
  -- branches / warehouses
  v_cai uuid; v_alx uuid; v_giz uuid;
  v_wh_cai uuid; v_wh_alx uuid; v_wh_giz uuid;
  v_van_cai uuid; v_van_alx uuid; v_van_cash uuid;
  -- departments
  d_platform uuid; d_mgmt uuid; d_fin uuid; d_proc uuid; d_sales uuid;
  d_van uuid; d_wh uuid; d_inv uuid; d_cs uuid; d_ops uuid; d_merch uuid; d_rep uuid;
  -- users
  u_owner uuid := gen_random_uuid(); u_ceo uuid := gen_random_uuid();
  u_gm uuid := gen_random_uuid(); u_finmgr uuid := gen_random_uuid();
  u_acc uuid := gen_random_uuid(); u_procmgr uuid := gen_random_uuid();
  u_buyer uuid := gen_random_uuid(); u_salesmgr uuid := gen_random_uuid();
  u_sup uuid := gen_random_uuid(); u_salesman uuid := gen_random_uuid();
  u_vanrep uuid := gen_random_uuid(); u_whmgr uuid := gen_random_uuid();
  u_whkeep uuid := gen_random_uuid(); u_invctl uuid := gen_random_uuid();
  u_merch uuid := gen_random_uuid(); u_csagent uuid := gen_random_uuid();
  u_roexec uuid := gen_random_uuid();
  -- refined FMCG roles (part of default provisioning)
  u_cashvan uuid := gen_random_uuid(); u_collector uuid := gen_random_uuid();
  u_creditctl uuid := gen_random_uuid();
  -- categories
  c_bev uuid; c_snk uuid; c_dai uuid; c_pc uuid; c_hc uuid;
  -- price lists
  pl_std uuid; pl_whl uuid;
  -- routes
  r_cai_a uuid; r_cai_b uuid; r_alx_a uuid; r_cai_c uuid;
  -- working scratch
  v_prod uuid; v_first uuid; v_cust uuid; v_sup uuid; v_po uuid; v_tr uuid;
  i int;
BEGIN
  ----------------------------------------------------------------------------
  -- Idempotency guard
  ----------------------------------------------------------------------------
  SELECT id INTO v_co FROM erp_companies WHERE name = 'Nile FMCG Distribution Group';
  IF v_co IS NOT NULL THEN
    RAISE NOTICE 'Reference company already exists (%). Nothing to do.', v_co;
    RETURN;
  END IF;

  ----------------------------------------------------------------------------
  -- Seed-identity hygiene. The auth schema is NOT dropped by `DROP SCHEMA public`,
  -- so on a recreate-from-scratch (drop public → re-bootstrap → re-run this seed)
  -- the prior run's auth.users rows survive and email lookups would return stale
  -- duplicates. Purge any prior demo identities (this domain is demo-only) so each
  -- recreation yields exactly one user per email. No-op on a first run.
  ----------------------------------------------------------------------------
  DELETE FROM auth.users WHERE email LIKE '%@nile-group.test';

  ----------------------------------------------------------------------------
  -- Company + FMCG/van-sales policy + return reasons
  ----------------------------------------------------------------------------
  INSERT INTO erp_companies(name, name_ar, currency, country, tax_number, address, phone, email, business_type)
    VALUES ('Nile FMCG Distribution Group', 'مجموعة النيل لتوزيع السلع', 'EGP', 'EG',
            'EG-100-200-300', 'Smart Village, Cairo, Egypt', '+20-2-3500-0000', 'info@nile-group.test', 'fmcg')
    RETURNING id INTO v_co;
  INSERT INTO erp_van_sales_settings(company_id, is_enabled, discount_cap_pct, allow_negative_van_stock, require_physical_count_on_close)
    VALUES (v_co, true, 15, false, true);
  INSERT INTO erp_fmcg_settings(company_id) VALUES (v_co) ON CONFLICT DO NOTHING;
  -- Enable the modules a van-sales FMCG distributor needs; otherwise the nav
  -- (visibleSections) hides the field/van-sales/distribution/returns/warehousing
  -- screens and reps/merchandisers see almost nothing.
  INSERT INTO erp_company_modules(company_id, module, enabled)
  SELECT v_co, m, true FROM unnest(ARRAY['sales','inventory','purchasing','accounting',
    'distribution','crm','analytics','warehousing','returns','integrations']) AS m
  ON CONFLICT DO NOTHING;
  INSERT INTO erp_return_reasons(company_id, code, label_en, label_ar) VALUES
    (v_co, 'damaged', 'Damaged', 'تالف'),
    (v_co, 'expired', 'Expired', 'منتهي الصلاحية'),
    (v_co, 'wrong_item', 'Wrong item', 'صنف خاطئ'),
    (v_co, 'customer_rejection', 'Customer rejection', 'رفض العميل'),
    (v_co, 'overstock', 'Overstock', 'فائض مخزون')
  ON CONFLICT (company_id, code) DO NOTHING;

  -- Default field-form SECTIONS per entity, so the Roles & Permissions →
  -- Section Access governance screen has sections to manage out of the box
  -- (a fresh tenant otherwise shows "No sections exist for this entity").
  INSERT INTO erp_field_sections(company_id, entity, key, label_en, label_ar, sort, collapsible, default_collapsed)
  SELECT v_co, x.entity, x.key, x.le, x.la, x.sort, true, false FROM (VALUES
    ('customer','basic','Basic Information','المعلومات الأساسية',1),
    ('customer','contact','Contact','بيانات التواصل',2),
    ('customer','financial','Credit & Financial','الائتمان والمالية',3),
    ('customer','location','Location & GPS','الموقع و GPS',4),
    ('customer','classification','Classification','التصنيف',5),
    ('product','basic','Basic Information','المعلومات الأساسية',1),
    ('product','pricing','Pricing & Tax','التسعير والضريبة',2),
    ('product','inventory','Inventory','المخزون',3),
    ('product','packaging','Packaging','التعبئة',4),
    ('invoice','header','Header','الترويسة',1),
    ('invoice','lines','Line Items','بنود الفاتورة',2),
    ('invoice','totals','Totals & Payment','الإجماليات والدفع',3),
    ('supplier','basic','Basic Information','المعلومات الأساسية',1),
    ('supplier','contact','Contact','بيانات التواصل',2),
    ('supplier','financial','Financial','المالية',3),
    ('route','basic','Basic Information','المعلومات الأساسية',1),
    ('route','schedule','Schedule','الجدول',2),
    ('route','assignment','Rep & Van','المندوب والعربة',3)
  ) AS x(entity,key,le,la,sort)
  WHERE NOT EXISTS (SELECT 1 FROM erp_field_sections fs WHERE fs.company_id=v_co AND fs.entity=x.entity AND fs.key=x.key);

  ----------------------------------------------------------------------------
  -- Refined FMCG roles (default provisioning) + company-scoped permissions.
  -- erp_user_has_permission() prefers a company-scoped grant over the global
  -- default, so these tighten/extend behavior for THIS tenant only. Every new
  -- FMCG tenant created from this seed receives the refined roles automatically
  -- — no separate hardening step required.
  --   • Merchandiser       — assortment/survey/grade; NO selling/collection.
  --   • Cash Van           — cash sell + collect; NO credit (perm + DB guard).
  --   • Van Sales Rep      — salesman + sales.credit (cash AND credit).
  --   • Collection Officer — collect only; NO selling.
  --   • Credit Controller  — credit.request.approve; NO journal posting.
  ----------------------------------------------------------------------------
  INSERT INTO erp_roles(key, name_ar, is_system, rank) VALUES
    ('merchandiser',      'منسق عرض',       false, 2),
    ('cash_van',          'مندوب بيع نقدي', false, 2),
    ('collection_officer','موظف تحصيل',     false, 3),
    ('credit_controller', 'مراقب ائتمان',   false, 5),
    ('inventory_controller','مراقب مخزون',  false, 4)
  ON CONFLICT (key) DO NOTHING;

  INSERT INTO erp_company_role_permissions(company_id, role_key, permission)
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
    -- Van Sales Rep: cash_van set + credit selling (superset of global salesman).
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
    ('inventory_controller','inventory.view'),('inventory_controller','stock.view'),
    ('inventory_controller','product.search'),('inventory_controller','inventory.count'),
    ('inventory_controller','inventory.adjust'),('inventory_controller','stock.adjust'),
    ('inventory_controller','stock.transfer'),('inventory_controller','stock_request.approve'),
    ('inventory_controller','reconciliation.view'),('inventory_controller','report.aggregate.view'),
    ('credit_controller','accounting.view'),('credit_controller','accounting.voucher.approve'),
    ('credit_controller','sales.collect'),('credit_controller','suppliers.manage'),
    ('credit_controller','customers.change_status'),('credit_controller','reports.view'),
    ('credit_controller','report.aggregate.view')
  ) AS g(role_key, permission)
  ON CONFLICT (company_id, role_key, permission) DO NOTHING;

  -- GM ≠ Company Admin: General Manager (manager) = operations only. Company-scoped
  -- manager override = global manager perms MINUS the governance set (staff/branch/
  -- field/integration admin stays with admin). Tenant-scoped; global is untouched.
  INSERT INTO erp_company_role_permissions(company_id, role_key, permission)
  SELECT v_co, 'manager', rp.permission FROM erp_role_permissions rp
  WHERE rp.role_key='manager'
    AND rp.permission NOT IN ('settings.users','settings.branches','settings.custom_fields',
                              'integrations.manage','user.import','user.transfer','workflow.manage')
  ON CONFLICT (company_id, role_key, permission) DO NOTHING;

  ----------------------------------------------------------------------------
  -- Branches (multi-branch) + main warehouses + van warehouses
  ----------------------------------------------------------------------------
  INSERT INTO erp_branches(company_id, code, name, name_ar, city, is_hq) VALUES
    (v_co, 'CAI', 'Cairo HQ', 'القاهرة - الرئيسي', 'Cairo', true)  RETURNING id INTO v_cai;
  INSERT INTO erp_branches(company_id, code, name, name_ar, city) VALUES
    (v_co, 'ALX', 'Alexandria', 'الإسكندرية', 'Alexandria')        RETURNING id INTO v_alx;
  INSERT INTO erp_branches(company_id, code, name, name_ar, city) VALUES
    (v_co, 'GIZ', 'Giza', 'الجيزة', 'Giza')                         RETURNING id INTO v_giz;

  INSERT INTO erp_warehouses(branch_id, code, name, warehouse_type) VALUES (v_cai, 'WH-CAI', 'Cairo Main Warehouse', 'main') RETURNING id INTO v_wh_cai;
  INSERT INTO erp_warehouses(branch_id, code, name, warehouse_type) VALUES (v_alx, 'WH-ALX', 'Alexandria Warehouse', 'main') RETURNING id INTO v_wh_alx;
  INSERT INTO erp_warehouses(branch_id, code, name, warehouse_type) VALUES (v_giz, 'WH-GIZ', 'Giza Warehouse', 'main')       RETURNING id INTO v_wh_giz;

  ----------------------------------------------------------------------------
  -- Users (auth + profile via trigger). Self-contained demo; for a production
  -- pilot, invite users via Settings → Users and drop the auth.users block.
  ----------------------------------------------------------------------------
  INSERT INTO auth.users(id, email) VALUES
    (u_owner,   'owner@nile-group.test'),     (u_ceo,     'ceo@nile-group.test'),
    (u_gm,      'gm@nile-group.test'),         (u_finmgr,  'finance.manager@nile-group.test'),
    (u_acc,     'accountant@nile-group.test'), (u_procmgr, 'procurement.manager@nile-group.test'),
    (u_buyer,   'buyer@nile-group.test'),      (u_salesmgr,'sales.manager@nile-group.test'),
    (u_sup,     'supervisor@nile-group.test'), (u_salesman,'salesman@nile-group.test'),
    (u_vanrep,  'van.rep@nile-group.test'),    (u_whmgr,   'warehouse.manager@nile-group.test'),
    (u_whkeep,  'warehouse.keeper@nile-group.test'), (u_invctl, 'inventory.controller@nile-group.test'),
    (u_merch,   'merchandiser@nile-group.test'),(u_csagent, 'cs.agent@nile-group.test'),
    (u_roexec,  'readonly.exec@nile-group.test'),
    (u_cashvan, 'cash.van@nile-group.test'),    (u_collector,'collection.officer@nile-group.test'),
    (u_creditctl,'credit.controller@nile-group.test');

  ----------------------------------------------------------------------------
  -- GoTrue login completeness. A raw INSERT into auth.users does NOT make a
  -- user able to sign in: Supabase Auth needs a password, instance_id set to the
  -- single-tenant zero-UUID, and a matching auth.identities row (provider=email).
  -- Without the identity + instance_id, every login returns "Invalid email or
  -- password" even with the correct password. Set a shared DEMO password and
  -- create the identities so these demo users can actually authenticate.
  ----------------------------------------------------------------------------
  UPDATE auth.users
     SET instance_id        = '00000000-0000-0000-0000-000000000000',
         encrypted_password = extensions.crypt('Vantora#Demo1', extensions.gen_salt('bf')),
         email_confirmed_at = COALESCE(email_confirmed_at, now()),
         aud                = 'authenticated',
         role               = 'authenticated',
         raw_app_meta_data  = '{"provider":"email","providers":["email"]}'::jsonb
   WHERE email LIKE '%@nile-group.test';

  INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  SELECT u.id::text, u.id,
         jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
         'email', now(), now(), now()
  FROM auth.users u
  WHERE u.email LIKE '%@nile-group.test'
    AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email');

  -- Platform Owner is a PLATFORM-level (vendor) identity, not a company role.
  UPDATE erp_profiles SET is_platform_owner = true WHERE id = u_owner;

  ----------------------------------------------------------------------------
  -- Departments (12) — managers wired after users exist
  ----------------------------------------------------------------------------
  INSERT INTO erp_departments(company_id, branch_id, name, name_ar, manager_id) VALUES
    (v_co, v_cai, 'Platform Owner', 'مالك المنصة', u_owner)             RETURNING id INTO d_platform;
  INSERT INTO erp_departments(company_id, branch_id, name, name_ar, manager_id) VALUES
    (v_co, v_cai, 'Company Management', 'إدارة الشركة', u_ceo)          RETURNING id INTO d_mgmt;
  INSERT INTO erp_departments(company_id, branch_id, name, name_ar, manager_id) VALUES
    (v_co, v_cai, 'Finance & Accounting', 'المالية والحسابات', u_finmgr) RETURNING id INTO d_fin;
  INSERT INTO erp_departments(company_id, branch_id, name, name_ar, manager_id) VALUES
    (v_co, v_cai, 'Procurement', 'المشتريات', u_procmgr)               RETURNING id INTO d_proc;
  INSERT INTO erp_departments(company_id, branch_id, name, name_ar, manager_id) VALUES
    (v_co, v_cai, 'Sales', 'المبيعات', u_salesmgr)                     RETURNING id INTO d_sales;
  INSERT INTO erp_departments(company_id, branch_id, name, name_ar, manager_id) VALUES
    (v_co, v_cai, 'Van Sales', 'البيع المتنقل', u_sup)                 RETURNING id INTO d_van;
  INSERT INTO erp_departments(company_id, branch_id, name, name_ar, manager_id) VALUES
    (v_co, v_cai, 'Warehousing', 'المخازن', u_whmgr)                   RETURNING id INTO d_wh;
  INSERT INTO erp_departments(company_id, branch_id, name, name_ar, manager_id) VALUES
    (v_co, v_cai, 'Inventory Control', 'مراقبة المخزون', u_invctl)     RETURNING id INTO d_inv;
  INSERT INTO erp_departments(company_id, branch_id, name, name_ar, manager_id) VALUES
    (v_co, v_cai, 'Customer Service', 'خدمة العملاء', u_csagent)       RETURNING id INTO d_cs;
  INSERT INTO erp_departments(company_id, branch_id, name, name_ar, manager_id) VALUES
    (v_co, v_cai, 'Operations', 'العمليات', u_gm)                      RETURNING id INTO d_ops;
  INSERT INTO erp_departments(company_id, branch_id, name, name_ar, manager_id) VALUES
    (v_co, v_cai, 'Merchandising', 'التسويق الميداني', u_merch)        RETURNING id INTO d_merch;
  INSERT INTO erp_departments(company_id, branch_id, name, name_ar, manager_id) VALUES
    (v_co, v_cai, 'Reporting & Analytics', 'التقارير والتحليلات', u_roexec) RETURNING id INTO d_rep;

  -- Job titles (one per user)
  INSERT INTO erp_job_titles(company_id, name, name_ar) VALUES
    (v_co, 'Platform Owner', 'مالك المنصة'),
    (v_co, 'Chief Executive Officer', 'الرئيس التنفيذي'),
    (v_co, 'General Manager', 'المدير العام'),
    (v_co, 'Finance Manager', 'مدير المالية'),
    (v_co, 'Accountant', 'محاسب'),
    (v_co, 'Procurement Manager', 'مدير المشتريات'),
    (v_co, 'Buyer', 'مشتري'),
    (v_co, 'Sales Manager', 'مدير المبيعات'),
    (v_co, 'Field Supervisor', 'مشرف ميداني'),
    (v_co, 'Salesman', 'مندوب مبيعات'),
    (v_co, 'Van Sales Rep', 'مندوب بيع متنقل'),
    (v_co, 'Warehouse Manager', 'مدير المخزن'),
    (v_co, 'Warehouse Keeper', 'أمين مخزن'),
    (v_co, 'Inventory Controller', 'مراقب مخزون'),
    (v_co, 'Merchandiser', 'منسق عرض'),
    (v_co, 'Customer Service Agent', 'موظف خدمة عملاء'),
    (v_co, 'Read-Only Executive', 'تنفيذي للاطلاع'),
    (v_co, 'Cash Van Rep', 'مندوب بيع نقدي'),
    (v_co, 'Collection Officer', 'موظف تحصيل'),
    (v_co, 'Credit Controller', 'مراقب ائتمان');

  ----------------------------------------------------------------------------
  -- Branch memberships (role = enforced BranchRole) + department/job title
  -- Helper note: job_title_id resolved by name within the company.
  ----------------------------------------------------------------------------
  -- Platform Owner: cross-tenant identity, intentionally NO branch role row.
  INSERT INTO erp_user_branches(user_id, branch_id, role, is_default, department_id, job_title_id) VALUES
    (u_ceo,     v_cai, 'admin',            true, d_mgmt,  (SELECT id FROM erp_job_titles WHERE company_id=v_co AND name='Chief Executive Officer')),
    (u_gm,      v_cai, 'manager',          true, d_ops,   (SELECT id FROM erp_job_titles WHERE company_id=v_co AND name='General Manager')),
    (u_finmgr,  v_cai, 'accountant',       true, d_fin,   (SELECT id FROM erp_job_titles WHERE company_id=v_co AND name='Finance Manager')),
    (u_acc,     v_cai, 'accountant',       true, d_fin,   (SELECT id FROM erp_job_titles WHERE company_id=v_co AND name='Accountant')),
    (u_procmgr, v_cai, 'branch_manager',   true, d_proc,  (SELECT id FROM erp_job_titles WHERE company_id=v_co AND name='Procurement Manager')),
    (u_buyer,   v_cai, 'warehouse_keeper', true, d_proc,  (SELECT id FROM erp_job_titles WHERE company_id=v_co AND name='Buyer')),
    (u_salesmgr,v_cai, 'regional_manager', true, d_sales, (SELECT id FROM erp_job_titles WHERE company_id=v_co AND name='Sales Manager')),
    (u_sup,     v_cai, 'supervisor',       true, d_van,   (SELECT id FROM erp_job_titles WHERE company_id=v_co AND name='Field Supervisor')),
    (u_vanrep,  v_cai, 'salesman',         true, d_van,   (SELECT id FROM erp_job_titles WHERE company_id=v_co AND name='Van Sales Rep')),
    (u_whmgr,   v_cai, 'warehouse_keeper', true, d_wh,    (SELECT id FROM erp_job_titles WHERE company_id=v_co AND name='Warehouse Manager')),
    (u_whkeep,  v_cai, 'warehouse_keeper', true, d_wh,    (SELECT id FROM erp_job_titles WHERE company_id=v_co AND name='Warehouse Keeper')),
    (u_invctl,  v_cai, 'inventory_controller', true, d_inv, (SELECT id FROM erp_job_titles WHERE company_id=v_co AND name='Inventory Controller')),
    (u_merch,   v_cai, 'merchandiser',     true, d_merch, (SELECT id FROM erp_job_titles WHERE company_id=v_co AND name='Merchandiser')),
    (u_csagent, v_cai, 'cashier',          true, d_cs,    (SELECT id FROM erp_job_titles WHERE company_id=v_co AND name='Customer Service Agent')),
    (u_roexec,  v_cai, 'viewer',           true, d_rep,   (SELECT id FROM erp_job_titles WHERE company_id=v_co AND name='Read-Only Executive')),
    -- Refined FMCG roles: cash-only van rep, collect-only officer, credit controller.
    (u_cashvan, v_cai, 'cash_van',         true, d_van,   (SELECT id FROM erp_job_titles WHERE company_id=v_co AND name='Cash Van Rep')),
    (u_collector,v_cai,'collection_officer',true, d_fin,  (SELECT id FROM erp_job_titles WHERE company_id=v_co AND name='Collection Officer')),
    (u_creditctl,v_cai,'credit_controller',true, d_fin,   (SELECT id FROM erp_job_titles WHERE company_id=v_co AND name='Credit Controller')),
    -- Salesman operates the Alexandria branch/van
    (u_salesman,v_alx, 'salesman',         true, d_sales, (SELECT id FROM erp_job_titles WHERE company_id=v_co AND name='Salesman'));
  -- Multi-branch oversight: CEO across all branches; Sales Manager + Supervisor also at ALX.
  INSERT INTO erp_user_branches(user_id, branch_id, role, is_default) VALUES
    (u_ceo, v_alx, 'admin', false), (u_ceo, v_giz, 'admin', false),
    (u_salesmgr, v_alx, 'regional_manager', false),
    (u_sup, v_alx, 'supervisor', false);

  ----------------------------------------------------------------------------
  -- Van warehouses (assigned to reps)
  ----------------------------------------------------------------------------
  INSERT INTO erp_warehouses(branch_id, code, name, is_van, assigned_to, warehouse_type)
    VALUES (v_cai, 'VAN-CAI-01', 'Cairo Van 01', true, u_vanrep, 'van')  RETURNING id INTO v_van_cai;
  INSERT INTO erp_warehouses(branch_id, code, name, is_van, assigned_to, warehouse_type)
    VALUES (v_alx, 'VAN-ALX-01', 'Alex Van 01', true, u_salesman, 'van') RETURNING id INTO v_van_alx;
  -- Cash-only van (Cairo) for the Cash Van Rep — cash sales, no credit invoices.
  INSERT INTO erp_warehouses(branch_id, code, name, is_van, assigned_to, warehouse_type)
    VALUES (v_cai, 'VAN-CAI-02', 'Cairo Cash Van 02', true, u_cashvan, 'van') RETURNING id INTO v_van_cash;

  ----------------------------------------------------------------------------
  -- Product categories + brands (brand is a product attribute, not a table)
  ----------------------------------------------------------------------------
  INSERT INTO erp_product_categories(code, name, name_ar) VALUES ('BEV','Beverages','مشروبات')       RETURNING id INTO c_bev;
  INSERT INTO erp_product_categories(code, name, name_ar) VALUES ('SNK','Snacks','وجبات خفيفة')      RETURNING id INTO c_snk;
  INSERT INTO erp_product_categories(code, name, name_ar) VALUES ('DAI','Dairy','منتجات الألبان')    RETURNING id INTO c_dai;
  INSERT INTO erp_product_categories(code, name, name_ar) VALUES ('PC','Personal Care','عناية شخصية') RETURNING id INTO c_pc;
  INSERT INTO erp_product_categories(code, name, name_ar) VALUES ('HC','Home Care','عناية منزلية')   RETURNING id INTO c_hc;

  -- 18 SKUs: code, name, category, brand, unit, cost, sell, tax%, pack, barcode, expiry days
  INSERT INTO erp_products_catalog(company_id, code, name, name_ar, category_id, brand, unit, cost_price, sell_price, tax_rate, pack_size, barcode, expiry_days, created_source) VALUES
    (v_co,'BEV-001','Nile Cola 330ml','نايل كولا 330مل', c_bev,'NileCola','carton', 60,  90, 14,'24x330ml','622000000001',180,'erp'),
    (v_co,'BEV-002','Nile Cola 1L','نايل كولا 1لتر',     c_bev,'NileCola','carton',110, 160, 14,'12x1L','622000000002',180,'erp'),
    (v_co,'BEV-003','Oasis Water 600ml','واحة مياه 600مل',c_bev,'Oasis','carton', 30,  48,  0,'24x600ml','622000000003',365,'erp'),
    (v_co,'BEV-004','Sunrise Juice Mango','صن رايز مانجو',c_bev,'Sunrise','carton', 90, 135, 14,'18x250ml','622000000004',270,'erp'),
    (v_co,'SNK-001','CrispMax Chips 25g','كريسب ماكس 25جم',c_snk,'CrispMax','carton', 48,  78, 14,'48x25g','622000000005',120,'erp'),
    (v_co,'SNK-002','CrispMax Chips 80g','كريسب ماكس 80جم',c_snk,'CrispMax','carton', 96, 150, 14,'24x80g','622000000006',120,'erp'),
    (v_co,'SNK-003','GoldBar Wafer','جولد بار ويفر',     c_snk,'GoldBar','carton', 72, 110, 14,'36x18g','622000000007',240,'erp'),
    (v_co,'SNK-004','NuttyMix 150g','ناتي ميكس 150جم',   c_snk,'NuttyMix','carton',120, 190, 14,'12x150g','622000000008',300,'erp'),
    (v_co,'DAI-001','DairyPure Milk 1L','ديري بيور حليب 1لتر',c_dai,'DairyPure','carton', 95, 140, 0,'12x1L','622000000009',30,'erp'),
    (v_co,'DAI-002','DairyPure Yoghurt','ديري بيور زبادي',c_dai,'DairyPure','carton', 70, 108, 0,'24x100g','622000000010',21,'erp'),
    (v_co,'DAI-003','DairyPure Cheese 250g','ديري بيور جبن',c_dai,'DairyPure','carton',130, 200, 14,'12x250g','622000000011',60,'erp'),
    (v_co,'PC-001','FreshUp Shampoo 400ml','فريش أب شامبو',c_pc,'FreshUp','carton',140, 225, 14,'12x400ml','622000000012',730,'erp'),
    (v_co,'PC-002','FreshUp Soap 120g','فريش أب صابون',  c_pc,'FreshUp','carton', 60,  99, 14,'48x120g','622000000013',730,'erp'),
    (v_co,'PC-003','SmileBright Toothpaste','سمايل برايت معجون',c_pc,'SmileBright','carton',100, 165, 14,'24x100ml','622000000014',730,'erp'),
    (v_co,'HC-001','SparkleClean Dish 500ml','سباركل غسيل',c_hc,'SparkleClean','carton',105, 170, 14,'12x500ml','622000000015',730,'erp'),
    (v_co,'HC-002','SparkleClean Bleach 1L','سباركل مبيض',c_hc,'SparkleClean','carton', 80, 132, 14,'12x1L','622000000016',365,'erp'),
    (v_co,'HC-003','HomeShield Detergent 2kg','هوم شيلد منظف',c_hc,'HomeShield','carton',180, 290, 14,'6x2kg','622000000017',730,'erp'),
    (v_co,'HC-004','HomeShield Air Fresh','هوم شيلد معطر',c_hc,'HomeShield','carton', 90, 150, 14,'24x300ml','622000000018',730,'erp');

  SELECT id INTO v_first FROM erp_products_catalog WHERE company_id = v_co AND code = 'BEV-001';

  ----------------------------------------------------------------------------
  -- Suppliers (with payment terms)
  ----------------------------------------------------------------------------
  INSERT INTO erp_suppliers(company_id, code, name, name_ar, phone, tax_number, balance, payment_terms_days) VALUES
    (v_co,'SUP-001','Nile Beverage Bottling','شركة النيل للمشروبات','+20-2-2700-0001','EG-S-001',0,30),
    (v_co,'SUP-002','CrispMax Foods Egypt','كريسب ماكس للأغذية','+20-2-2700-0002','EG-S-002',0,45),
    (v_co,'SUP-003','DairyPure Industries','ديري بيور للصناعات','+20-3-4200-0003','EG-S-003',0,15),
    (v_co,'SUP-004','FreshUp Personal Care','فريش أب للعناية','+20-2-2700-0004','EG-S-004',0,60),
    (v_co,'SUP-005','HomeShield Manufacturing','هوم شيلد للتصنيع','+20-2-2700-0005','EG-S-005',0,60);

  ----------------------------------------------------------------------------
  -- Price lists + items + dynamic price rules
  ----------------------------------------------------------------------------
  INSERT INTO erp_price_lists(company_id, name, name_ar, is_default) VALUES (v_co,'Standard Retail','قائمة التجزئة', true) RETURNING id INTO pl_std;
  INSERT INTO erp_price_lists(company_id, name, name_ar) VALUES (v_co,'Wholesale','قائمة الجملة') RETURNING id INTO pl_whl;
  -- Standard list mirrors sell_price; Wholesale gives ~8% off — for a few SKUs.
  INSERT INTO erp_price_list_items(price_list_id, product_id, unit_price)
    SELECT pl_std, id, sell_price FROM erp_products_catalog WHERE company_id = v_co;
  INSERT INTO erp_price_list_items(price_list_id, product_id, unit_price)
    SELECT pl_whl, id, round(sell_price * 0.92, 2) FROM erp_products_catalog WHERE company_id = v_co;
  -- Dynamic rules: company-wide 5% off NuttyMix (min 5 cartons); global launch price on Air Fresh.
  INSERT INTO erp_price_rules(company_id, product_id, scope_type, scope_id, price_type, value, min_qty, is_active)
    SELECT v_co, id, 'global', NULL, 'percent_off', 5, 5, true FROM erp_products_catalog WHERE company_id = v_co AND code='SNK-004';

  ----------------------------------------------------------------------------
  -- Routes (rep + van + working days)
  ----------------------------------------------------------------------------
  INSERT INTO erp_routes(company_id, branch_id, code, name, rep_id, van_warehouse_id, working_days, status)
    VALUES (v_co, v_cai,'RT-CAI-A','Cairo Route A', u_vanrep, v_van_cai, ARRAY['sat','sun','mon'], 'active') RETURNING id INTO r_cai_a;
  INSERT INTO erp_routes(company_id, branch_id, code, name, rep_id, van_warehouse_id, working_days, status)
    VALUES (v_co, v_cai,'RT-CAI-B','Cairo Route B', u_vanrep, v_van_cai, ARRAY['tue','wed','thu'], 'active') RETURNING id INTO r_cai_b;
  INSERT INTO erp_routes(company_id, branch_id, code, name, rep_id, van_warehouse_id, working_days, status)
    VALUES (v_co, v_alx,'RT-ALX-A','Alex Route A', u_salesman, v_van_alx, ARRAY['sat','mon','wed'], 'active') RETURNING id INTO r_alx_a;
  INSERT INTO erp_routes(company_id, branch_id, code, name, rep_id, van_warehouse_id, working_days, status)
    VALUES (v_co, v_cai,'RT-CAI-C','Cairo Cash Route C', u_cashvan, v_van_cash, ARRAY['sat','tue'], 'active') RETURNING id INTO r_cai_c;

  ----------------------------------------------------------------------------
  -- Customers (24): credit limits, payment terms, GPS, routes, salesman.
  -- 1..16 Cairo (route A/B, rep = van rep); 17..22 Alex (route A, rep = salesman);
  -- 23..24 Giza (no route). Two left pending approval to exercise the CS workflow.
  ----------------------------------------------------------------------------
  FOR i IN 1..24 LOOP
    INSERT INTO erp_customers(company_id, branch_id, code, name, name_ar, phone, city,
                              is_approved, approval_status, credit_limit, balance,
                              payment_terms_days, salesman_id, route_id, latitude, longitude)
    VALUES (
      v_co,
      CASE WHEN i <= 16 THEN v_cai WHEN i <= 22 THEN v_alx ELSE v_giz END,
      'CUST-' || lpad(i::text, 3, '0'),
      'Retailer ' || i, 'تاجر ' || i,
      '+20-10-0000-' || lpad(i::text, 4, '0'),
      CASE WHEN i <= 16 THEN 'Cairo' WHEN i <= 22 THEN 'Alexandria' ELSE 'Giza' END,
      -- two pending (codes 015, 016); rest approved
      CASE WHEN i IN (15,16) THEN false ELSE true END,
      CASE WHEN i IN (15,16) THEN 'pending' ELSE 'approved' END,
      (3000 + (i % 6) * 2000)::numeric,                 -- credit limits 3k..13k
      0,
      (ARRAY[0,15,30])[1 + (i % 3)],                    -- payment terms 0/15/30
      CASE WHEN i <= 16 THEN u_vanrep WHEN i <= 22 THEN u_salesman ELSE NULL END,
      CASE WHEN i <= 8 THEN r_cai_a WHEN i <= 16 THEN r_cai_b WHEN i <= 22 THEN r_alx_a ELSE NULL END,
      CASE WHEN i <= 16 THEN 30.05 + (i % 5) * 0.001 WHEN i <= 22 THEN 31.20 + (i % 5) * 0.001 ELSE 30.01 + (i % 3) * 0.001 END,
      CASE WHEN i <= 16 THEN 31.24 + (i % 5) * 0.001 WHEN i <= 22 THEN 29.92 + (i % 5) * 0.001 ELSE 31.21 + (i % 3) * 0.001 END
    ) RETURNING id INTO v_cust;
    -- Customer-scoped 10% promo on Nile Cola 330ml for CUST-001 (server-side pricing demo).
    IF i = 1 THEN
      INSERT INTO erp_price_rules(company_id, product_id, scope_type, scope_id, price_type, value, min_qty, is_active)
        VALUES (v_co, v_first, 'customer', v_cust, 'percent_off', 10, 1, true);
    END IF;
  END LOOP;

  ----------------------------------------------------------------------------
  -- Opening stock: main warehouses 1000/SKU, vans 200/SKU (ready to sell).
  ----------------------------------------------------------------------------
  INSERT INTO erp_inventory_stock(warehouse_id, product_id, quantity)
    SELECT w.id, p.id, 1000
    FROM erp_warehouses w
    JOIN erp_branches b ON b.id = w.branch_id
    CROSS JOIN erp_products_catalog p
    WHERE b.company_id = v_co AND w.is_van = false AND p.company_id = v_co;
  INSERT INTO erp_inventory_stock(warehouse_id, product_id, quantity)
    SELECT w.id, p.id, 200
    FROM erp_warehouses w
    JOIN erp_branches b ON b.id = w.branch_id
    CROSS JOIN erp_products_catalog p
    WHERE b.company_id = v_co AND w.is_van = true AND p.company_id = v_co;

  ----------------------------------------------------------------------------
  -- Purchase activity: a received PO (adds main stock + supplier balance via the
  -- goods-receipt RPC) and an open PO record. Run as the CEO (branch access).
  ----------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', u_ceo::text, true);
  SELECT id INTO v_sup FROM erp_suppliers WHERE company_id = v_co AND code = 'SUP-001';
  INSERT INTO erp_purchase_orders(branch_id, supplier_id, po_number, status, total_amount, tax_amount, net_amount, created_by)
    VALUES (v_cai, v_sup, erp_next_number(v_cai,'purchase_order'), 'sent', 6000, 840, 6840, u_ceo) RETURNING id INTO v_po;
  INSERT INTO erp_purchase_order_lines(purchase_order_id, product_id, quantity, unit_price, line_total)
    SELECT v_po, id, 100, cost_price, 100 * cost_price FROM erp_products_catalog WHERE company_id = v_co AND code IN ('BEV-001','BEV-002');
  PERFORM erp_receive_purchase_order(v_po, v_wh_cai, '[]'::jsonb);
  -- A second, still-open PO (different supplier) for reporting coverage.
  SELECT id INTO v_sup FROM erp_suppliers WHERE company_id = v_co AND code = 'SUP-002';
  INSERT INTO erp_purchase_orders(branch_id, supplier_id, po_number, status, total_amount, tax_amount, net_amount, created_by)
    VALUES (v_cai, v_sup, erp_next_number(v_cai,'purchase_order'), 'sent', 4800, 672, 5472, u_ceo) RETURNING id INTO v_po;
  INSERT INTO erp_purchase_order_lines(purchase_order_id, product_id, quantity, unit_price, line_total)
    SELECT v_po, id, 50, cost_price, 50 * cost_price FROM erp_products_catalog WHERE company_id = v_co AND code IN ('SNK-001','SNK-002');

  ----------------------------------------------------------------------------
  -- Inventory movement: main → van transfer (Cairo), completed (stock + ledger).
  ----------------------------------------------------------------------------
  INSERT INTO erp_transfer_orders(transfer_number, from_warehouse_id, to_warehouse_id, status, created_by)
    VALUES (erp_next_number(v_cai,'transfer'), v_wh_cai, v_van_cai, 'in_transit', u_ceo) RETURNING id INTO v_tr;
  INSERT INTO erp_transfer_order_lines(transfer_order_id, product_id, quantity)
    SELECT v_tr, id, 50 FROM erp_products_catalog WHERE company_id = v_co AND code IN ('BEV-001','BEV-002','SNK-001');
  PERFORM erp_complete_transfer(v_tr);

  RAISE NOTICE '════════ VANTORA REFERENCE COMPANY PROVISIONED ════════';
  RAISE NOTICE 'company : % (Nile FMCG Distribution Group)', v_co;
  RAISE NOTICE 'branches: CAI=%  ALX=%  GIZ=%', v_cai, v_alx, v_giz;
  RAISE NOTICE 'vans    : CAI=% (rep %)  ALX=% (salesman %)', v_van_cai, u_vanrep, v_van_alx, u_salesman;
  RAISE NOTICE 'users   : 1 platform owner + 19 company users · 12 departments · 20 job titles';
  RAISE NOTICE 'roles   : refined FMCG set active (merchandiser · cash_van · collection_officer · credit_controller; van rep = cash+credit)';
  RAISE NOTICE 'master  : 5 categories · 18 SKUs · 5 suppliers · 2 price lists · 2 price rules · 4 routes · 24 customers · 5 return reasons';
  RAISE NOTICE 'activity: opening stock loaded · 1 PO received + 1 open · 1 main→van transfer completed';
  RAISE NOTICE 'next    : run reference-activity-and-validate.sql';
END $$;

-- ============================================================================
-- Defence-in-depth: block Cash Van reps from creating credit (future-due)
-- invoices at the database layer, independent of the UI. Top-level DDL so the
-- guard exists for every tenant provisioned from this seed. Idempotent.
-- ============================================================================
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
