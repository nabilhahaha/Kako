-- ============================================================================
-- DEMO SEED — "Demo Food Distribution Company" (realistic KSA FMCG distributor)
-- ----------------------------------------------------------------------------
-- Self-contained, IDEMPOTENT end-to-end demo tenant for the full admin journey.
-- NOT part of the migration chain → never runs on production. Run explicitly
-- against a NON-PROD (preview) database:
--     psql "$PREVIEW_DATABASE_URL" -f supabase/demo/food_distribution_seed.sql
-- Re-runnable (fixed UUIDs + ON CONFLICT). Shared demo password: Demo@2026
-- Teardown: delete from erp_companies where id='da000000-0000-4000-8000-000000000001';
-- ============================================================================
set search_path = public, extensions;

-- ── Company ────────────────────────────────────────────────────────────────
insert into erp_companies (id, name, name_ar, currency, address, is_active) values
  ('da000000-0000-4000-8000-000000000001','Demo Food Distribution Company','شركة توزيع الأغذية التجريبية','SAR','FMCG / Food Distribution (DEMO) — KSA', true)
on conflict (id) do update set name=excluded.name, currency=excluded.currency, address=excluded.address;

-- ── Branches: Riyadh / Jeddah / Dammam ─────────────────────────────────────
insert into erp_branches (id, company_id, code, name, region, area, is_hq) values
  ('da000000-0000-4000-8000-0000000000b1','da000000-0000-4000-8000-000000000001','RUH','Riyadh','Central','Riyadh', true),
  ('da000000-0000-4000-8000-0000000000b2','da000000-0000-4000-8000-000000000001','JED','Jeddah','Western','Jeddah', false),
  ('da000000-0000-4000-8000-0000000000b3','da000000-0000-4000-8000-000000000001','DMM','Dammam','Eastern','Dammam', false)
on conflict (id) do update set region=excluded.region, area=excluded.area;

-- ── Auth users (loginable; bcrypt via pgcrypto) — full FMCG hierarchy ──────
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated','authenticated', u.email,
  extensions.crypt('Demo@2026', extensions.gen_salt('bf')), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', u.full_name), now(), now()
from (values
  ('da000000-0000-4000-8000-0000000000a0'::uuid,'admin.fooddist@demo.com','Demo Company Admin'),
  ('da000000-0000-4000-8000-0000000000a1','director.fooddist@demo.com','Demo Sales Director'),
  ('da000000-0000-4000-8000-0000000000a2','regional.fooddist@demo.com','Demo Regional Manager'),
  ('da000000-0000-4000-8000-0000000000a3','area.riyadh@demo.com','Demo Area Manager — Riyadh'),
  ('da000000-0000-4000-8000-0000000000a9','area.jeddah@demo.com','Demo Area Manager — Jeddah'),
  ('da000000-0000-4000-8000-0000000000aa','area.dammam@demo.com','Demo Area Manager — Dammam'),
  ('da000000-0000-4000-8000-0000000000a4','sup.riyadh@demo.com','Demo Supervisor — Riyadh'),
  ('da000000-0000-4000-8000-0000000000ab','sup.jeddah@demo.com','Demo Supervisor — Jeddah'),
  ('da000000-0000-4000-8000-0000000000ac','sup.dammam@demo.com','Demo Supervisor — Dammam'),
  ('da000000-0000-4000-8000-0000000000a5','rep.riyadh@demo.com','Demo Sales Rep — Riyadh'),
  ('da000000-0000-4000-8000-0000000000a6','rep.jeddah@demo.com','Demo Sales Rep — Jeddah'),
  ('da000000-0000-4000-8000-0000000000ad','rep.dammam@demo.com','Demo Sales Rep — Dammam'),
  ('da000000-0000-4000-8000-0000000000a7','finance.fooddist@demo.com','Demo Finance'),
  ('da000000-0000-4000-8000-0000000000a8','it.fooddist@demo.com','Demo IT Admin')
) u(id,email,full_name)
on conflict (id) do nothing;

insert into erp_profiles (id, full_name) select id, full_name from (values
  ('da000000-0000-4000-8000-0000000000a0'::uuid,'Demo Company Admin'),('da000000-0000-4000-8000-0000000000a1','Demo Sales Director'),
  ('da000000-0000-4000-8000-0000000000a2','Demo Regional Manager'),('da000000-0000-4000-8000-0000000000a3','Demo Area Manager — Riyadh'),
  ('da000000-0000-4000-8000-0000000000a9','Demo Area Manager — Jeddah'),('da000000-0000-4000-8000-0000000000aa','Demo Area Manager — Dammam'),
  ('da000000-0000-4000-8000-0000000000a4','Demo Supervisor — Riyadh'),('da000000-0000-4000-8000-0000000000ab','Demo Supervisor — Jeddah'),
  ('da000000-0000-4000-8000-0000000000ac','Demo Supervisor — Dammam'),('da000000-0000-4000-8000-0000000000a5','Demo Sales Rep — Riyadh'),
  ('da000000-0000-4000-8000-0000000000a6','Demo Sales Rep — Jeddah'),('da000000-0000-4000-8000-0000000000ad','Demo Sales Rep — Dammam'),
  ('da000000-0000-4000-8000-0000000000a7','Demo Finance'),('da000000-0000-4000-8000-0000000000a8','Demo IT Admin')
) p(id,full_name) on conflict (id) do update set full_name=excluded.full_name;

-- ── Role assignment + reporting hierarchy (5 FMCG levels across 3 branches) ─
insert into erp_user_branches (user_id, branch_id, role, is_default, reports_to) select user_id, branch_id, role, true, reports_to from (values
  ('da000000-0000-4000-8000-0000000000a0'::uuid,'da000000-0000-4000-8000-0000000000b1'::uuid,'admin',     null::uuid),
  ('da000000-0000-4000-8000-0000000000a1','da000000-0000-4000-8000-0000000000b1','manager',   'da000000-0000-4000-8000-0000000000a0'),  -- Sales Director
  ('da000000-0000-4000-8000-0000000000a2','da000000-0000-4000-8000-0000000000b1','manager',   'da000000-0000-4000-8000-0000000000a1'),  -- Regional
  ('da000000-0000-4000-8000-0000000000a3','da000000-0000-4000-8000-0000000000b1','manager',   'da000000-0000-4000-8000-0000000000a2'),  -- Area Riyadh
  ('da000000-0000-4000-8000-0000000000a9','da000000-0000-4000-8000-0000000000b2','manager',   'da000000-0000-4000-8000-0000000000a2'),  -- Area Jeddah
  ('da000000-0000-4000-8000-0000000000aa','da000000-0000-4000-8000-0000000000b3','manager',   'da000000-0000-4000-8000-0000000000a2'),  -- Area Dammam
  ('da000000-0000-4000-8000-0000000000a4','da000000-0000-4000-8000-0000000000b1','supervisor', 'da000000-0000-4000-8000-0000000000a3'),
  ('da000000-0000-4000-8000-0000000000ab','da000000-0000-4000-8000-0000000000b2','supervisor', 'da000000-0000-4000-8000-0000000000a9'),
  ('da000000-0000-4000-8000-0000000000ac','da000000-0000-4000-8000-0000000000b3','supervisor', 'da000000-0000-4000-8000-0000000000aa'),
  ('da000000-0000-4000-8000-0000000000a5','da000000-0000-4000-8000-0000000000b1','salesman',   'da000000-0000-4000-8000-0000000000a4'),
  ('da000000-0000-4000-8000-0000000000a6','da000000-0000-4000-8000-0000000000b2','salesman',   'da000000-0000-4000-8000-0000000000ab'),
  ('da000000-0000-4000-8000-0000000000ad','da000000-0000-4000-8000-0000000000b3','salesman',   'da000000-0000-4000-8000-0000000000ac'),
  ('da000000-0000-4000-8000-0000000000a7','da000000-0000-4000-8000-0000000000b1','accountant', 'da000000-0000-4000-8000-0000000000a1'),
  ('da000000-0000-4000-8000-0000000000a8','da000000-0000-4000-8000-0000000000b1','admin',      'da000000-0000-4000-8000-0000000000a0')
) ub(user_id, branch_id, role, reports_to) on conflict (user_id, branch_id) do update set role=excluded.role, reports_to=excluded.reports_to;

-- company-wide roles span all branches (branch visibility is membership-based)
insert into erp_user_branches (user_id, branch_id, role, is_default, reports_to) select user_id, branch_id, role, false, reports_to from (values
  ('da000000-0000-4000-8000-0000000000a0'::uuid,'da000000-0000-4000-8000-0000000000b2'::uuid,'admin',  null::uuid),
  ('da000000-0000-4000-8000-0000000000a0','da000000-0000-4000-8000-0000000000b3','admin',  null),
  ('da000000-0000-4000-8000-0000000000a1','da000000-0000-4000-8000-0000000000b2','manager','da000000-0000-4000-8000-0000000000a0'),
  ('da000000-0000-4000-8000-0000000000a1','da000000-0000-4000-8000-0000000000b3','manager','da000000-0000-4000-8000-0000000000a0'),
  ('da000000-0000-4000-8000-0000000000a2','da000000-0000-4000-8000-0000000000b2','manager','da000000-0000-4000-8000-0000000000a1'),
  ('da000000-0000-4000-8000-0000000000a2','da000000-0000-4000-8000-0000000000b3','manager','da000000-0000-4000-8000-0000000000a1')
) x(user_id, branch_id, role, reports_to) on conflict (user_id, branch_id) do nothing;

-- ── Demo roles + permissions (company-scoped matrix) ───────────────────────
insert into erp_matrix_role_permissions (company_id, role_key, permission)
select 'da000000-0000-4000-8000-000000000001', r, p from
  (values ('company_admin'),('sales_director'),('regional_manager'),('area_manager'),('supervisor'),('sales_rep'),('finance'),('it_admin'),
          ('manager'),('salesman')) roles(r)
  cross join (values ('field_ops:view'),('field_ops:dashboard'),('customers:view'),('reports:view')) perms(p)
on conflict do nothing;

-- ── Product hierarchy (category → sub-category → brand → SKU) ───────────────
insert into erp_product_categories (id, company_id, code, name) values
  ('da000000-0000-4000-8000-0000000000c1','da000000-0000-4000-8000-000000000001','DEMO-BEV','Beverages'),
  ('da000000-0000-4000-8000-0000000000c2','da000000-0000-4000-8000-000000000001','DEMO-SNK','Snacks')
on conflict (id) do nothing;
insert into erp_product_categories (id, company_id, code, name, parent_id) values
  ('da000000-0000-4000-8000-0000000000c3','da000000-0000-4000-8000-000000000001','DEMO-SODA','Soda','da000000-0000-4000-8000-0000000000c1'),
  ('da000000-0000-4000-8000-0000000000c4','da000000-0000-4000-8000-000000000001','DEMO-CHIPS','Chips','da000000-0000-4000-8000-0000000000c2')
on conflict (id) do nothing;
insert into erp_products_catalog (id, company_id, code, name, brand, category_id, unit, sell_price, external_id) values
  ('da000000-0000-4000-8000-0000000000f1','da000000-0000-4000-8000-000000000001','DEMO-COLA','Cola 330ml','AquaCola','da000000-0000-4000-8000-0000000000c3','piece',6, 'ERP-COLA'),
  ('da000000-0000-4000-8000-0000000000f2','da000000-0000-4000-8000-000000000001','DEMO-LEM','Lemon 330ml','AquaCola','da000000-0000-4000-8000-0000000000c3','piece',6, 'ERP-LEM'),
  ('da000000-0000-4000-8000-0000000000f3','da000000-0000-4000-8000-000000000001','DEMO-CHIP','Chips Classic','CrunchCo','da000000-0000-4000-8000-0000000000c4','piece',10,'ERP-CHIP'),
  ('da000000-0000-4000-8000-0000000000f4','da000000-0000-4000-8000-000000000001','DEMO-WTR','Water 600ml','AquaCola','da000000-0000-4000-8000-0000000000c1','piece',4, 'ERP-WTR')
on conflict (id) do nothing;

-- ── Routes (one per branch) + customers (4 channels, A/B/C classes) ────────
insert into erp_routes (id, company_id, name, rep_id) values
  ('da000000-0000-4000-8000-00000000aa01','da000000-0000-4000-8000-000000000001','Riyadh Route','da000000-0000-4000-8000-0000000000a5'),
  ('da000000-0000-4000-8000-00000000aa02','da000000-0000-4000-8000-000000000001','Jeddah Route','da000000-0000-4000-8000-0000000000a6'),
  ('da000000-0000-4000-8000-00000000aa03','da000000-0000-4000-8000-000000000001','Dammam Route','da000000-0000-4000-8000-0000000000ad')
on conflict (id) do nothing;
insert into erp_customers (id, company_id, code, name, branch_id, salesman_id, route_id, channel, classification, external_id) values
  ('da000000-0000-4000-8000-0000000000d1','da000000-0000-4000-8000-000000000001','DEMO-C1','Riyadh Mini Market','da000000-0000-4000-8000-0000000000b1','da000000-0000-4000-8000-0000000000a5','da000000-0000-4000-8000-00000000aa01','retail','A','ERP-C1'),
  ('da000000-0000-4000-8000-0000000000d2','da000000-0000-4000-8000-000000000001','DEMO-C2','Central Wholesale','da000000-0000-4000-8000-0000000000b1','da000000-0000-4000-8000-0000000000a5','da000000-0000-4000-8000-00000000aa01','wholesale','A','ERP-C2'),
  ('da000000-0000-4000-8000-0000000000d3','da000000-0000-4000-8000-000000000001','DEMO-C3','HyperPanda Olaya','da000000-0000-4000-8000-0000000000b1','da000000-0000-4000-8000-0000000000a5','da000000-0000-4000-8000-00000000aa01','key_account','A','ERP-C3'),
  ('da000000-0000-4000-8000-0000000000d4','da000000-0000-4000-8000-000000000001','DEMO-C4','Jeddah Corner Store','da000000-0000-4000-8000-0000000000b2','da000000-0000-4000-8000-0000000000a6','da000000-0000-4000-8000-00000000aa02','retail','B','ERP-C4'),
  ('da000000-0000-4000-8000-0000000000d5','da000000-0000-4000-8000-000000000001','DEMO-C5','Western Distributors','da000000-0000-4000-8000-0000000000b2','da000000-0000-4000-8000-0000000000a6','da000000-0000-4000-8000-00000000aa02','wholesale','B','ERP-C5'),
  ('da000000-0000-4000-8000-0000000000d6','da000000-0000-4000-8000-000000000001','DEMO-C6','Jeddah Discount Hub','da000000-0000-4000-8000-0000000000b2','da000000-0000-4000-8000-0000000000a6','da000000-0000-4000-8000-00000000aa02','discount','C','ERP-C6'),
  ('da000000-0000-4000-8000-0000000000d7','da000000-0000-4000-8000-000000000001','DEMO-C7','Dammam Fresh Market','da000000-0000-4000-8000-0000000000b3','da000000-0000-4000-8000-0000000000ad','da000000-0000-4000-8000-00000000aa03','retail','B','ERP-C7'),
  ('da000000-0000-4000-8000-0000000000d8','da000000-0000-4000-8000-000000000001','DEMO-C8','Eastern Key Account','da000000-0000-4000-8000-0000000000b3','da000000-0000-4000-8000-0000000000ad','da000000-0000-4000-8000-00000000aa03','key_account','A','ERP-C8'),
  ('da000000-0000-4000-8000-0000000000d9','da000000-0000-4000-8000-000000000001','DEMO-C9','Dammam Discount','da000000-0000-4000-8000-0000000000b3','da000000-0000-4000-8000-0000000000ad','da000000-0000-4000-8000-00000000aa03','discount','C','ERP-C9')
on conflict (id) do nothing;

-- ── Invoices: this month / last month / last year, per branch rep ──────────
do $$
declare rows record; i int := 0; v_inv uuid;
  v_p1 uuid := 'da000000-0000-4000-8000-0000000000f1'; v_p3 uuid := 'da000000-0000-4000-8000-0000000000f3';
begin
  for rows in select * from (values
    -- (slot, customer, branch, when, cola_qty, chip_qty)
    ('r1c','da000000-0000-4000-8000-0000000000d1','da000000-0000-4000-8000-0000000000b1', now(),                  60, 20),
    ('r1w','da000000-0000-4000-8000-0000000000d2','da000000-0000-4000-8000-0000000000b1', now(),                 120, 40),
    ('r1k','da000000-0000-4000-8000-0000000000d3','da000000-0000-4000-8000-0000000000b1', now(),                 150, 50),
    ('r2c','da000000-0000-4000-8000-0000000000d4','da000000-0000-4000-8000-0000000000b2', now(),                  70, 25),
    ('r2w','da000000-0000-4000-8000-0000000000d5','da000000-0000-4000-8000-0000000000b2', now(),                 100, 30),
    ('r3c','da000000-0000-4000-8000-0000000000d7','da000000-0000-4000-8000-0000000000b3', now(),                  90, 20),
    ('r3k','da000000-0000-4000-8000-0000000000d8','da000000-0000-4000-8000-0000000000b3', now(),                 110, 35),
    ('p1','da000000-0000-4000-8000-0000000000d1','da000000-0000-4000-8000-0000000000b1', now()-interval '1 month', 40, 15),
    ('p2','da000000-0000-4000-8000-0000000000d4','da000000-0000-4000-8000-0000000000b2', now()-interval '1 month', 60, 20),
    ('y1','da000000-0000-4000-8000-0000000000d1','da000000-0000-4000-8000-0000000000b1', now()-interval '1 year',  30, 10)
  ) t(slot, cust, branch, whn, colaq, chipq) loop
    v_inv := ('da000000-0000-4000-8000-' || lpad((900 + i)::text, 12, '0'))::uuid; i := i + 1;
    insert into erp_invoices (id, branch_id, customer_id, invoice_number, status, net_amount, total_amount, external_id, created_at)
      values (v_inv, rows.branch::uuid, rows.cust::uuid, 'DEMO-'||rows.slot, 'issued', rows.colaq*6 + rows.chipq*10, rows.colaq*6 + rows.chipq*10, 'ERP-'||rows.slot, rows.whn)
    on conflict (id) do nothing;
    insert into erp_invoice_lines (invoice_id, product_id, quantity, unit_price, line_total) values
      (v_inv, v_p1, rows.colaq, 6, rows.colaq*6), (v_inv, v_p3, rows.chipq, 10, rows.chipq*10)
    on conflict do nothing;
  end loop;
end $$;

-- ── Targets (current month) ────────────────────────────────────────────────
insert into erp_cp_targets (id, company_id, period_month, dim_type, dim_id, metric, target_amount, status) values
  ('da000000-0000-4000-8000-00000000ab01','da000000-0000-4000-8000-000000000001', date_trunc('month',now())::date,'rep','da000000-0000-4000-8000-0000000000a5','value', 1500,'active'),
  ('da000000-0000-4000-8000-00000000ab02','da000000-0000-4000-8000-000000000001', date_trunc('month',now())::date,'rep','da000000-0000-4000-8000-0000000000a6','value', 1100,'active'),
  ('da000000-0000-4000-8000-00000000ab04','da000000-0000-4000-8000-000000000001', date_trunc('month',now())::date,'rep','da000000-0000-4000-8000-0000000000ad','value', 1200,'active'),
  ('da000000-0000-4000-8000-00000000ab03','da000000-0000-4000-8000-000000000001', date_trunc('month',now())::date,'company',null,'value', 6000,'active')
on conflict (id) do nothing;

-- ── Promotions: 10% / Buy 5 Get 1 / Buy 10 Get 2 / Bundle (+ targeting) ────
insert into erp_tpm_promotions (id, company_id, name, promo_type, params, starts_on, ends_on, budget, cost, target_value, status) values
  ('da000000-0000-4000-8000-0000000000e1','da000000-0000-4000-8000-000000000001','10% Discount — Retail','percentage','{"discount_pct":10}', date_trunc('month',now())::date, (date_trunc('month',now())+interval '1 month - 1 day')::date, 8000, 2000, 12000, 'active'),
  ('da000000-0000-4000-8000-0000000000e2','da000000-0000-4000-8000-000000000001','Buy 5 Get 1 — Cola','buy_x_get_y','{"buy_sku":"DEMO-COLA","buy_qty":5,"get_qty":1}', date_trunc('month',now())::date, (date_trunc('month',now())+interval '1 month - 1 day')::date, 4000, 1200, 6000, 'active'),
  ('da000000-0000-4000-8000-0000000000e3','da000000-0000-4000-8000-000000000001','Buy 10 Get 2 — Chips','quantity','{"buy_qty":10,"free_qty":2}', date_trunc('month',now())::date, (date_trunc('month',now())+interval '1 month - 1 day')::date, 3000, 800, 4000, 'active'),
  ('da000000-0000-4000-8000-0000000000e4','da000000-0000-4000-8000-000000000001','Bundle — Cola 6 + Chips 2','bundle','{"bundle_skus":[{"sku":"DEMO-COLA","qty":6},{"sku":"DEMO-CHIP","qty":2}],"bundle_price":50}', date_trunc('month',now())::date, (date_trunc('month',now())+interval '1 month - 1 day')::date, 5000, 1500, 7000, 'approved')
on conflict (id) do nothing;
insert into erp_tpm_promotion_targets (promotion_id, company_id, dim_type, dim_id) values
  ('da000000-0000-4000-8000-0000000000e1','da000000-0000-4000-8000-000000000001','channel','retail'),
  ('da000000-0000-4000-8000-0000000000e2','da000000-0000-4000-8000-000000000001','sku','DEMO-COLA'),
  ('da000000-0000-4000-8000-0000000000e3','da000000-0000-4000-8000-000000000001','sku','DEMO-CHIP'),
  ('da000000-0000-4000-8000-0000000000e4','da000000-0000-4000-8000-000000000001','channel','key_account')
on conflict do nothing;

-- ── Commission plan: tiers + coverage + execution qualification ────────────
insert into erp_cp_commission_plans (id, company_id, name, dim_type, basis, payout_type, min_achievement_pct, min_coverage_pct, min_execution_score, status) values
  ('da000000-0000-4000-8000-0000000096a1','da000000-0000-4000-8000-000000000001','Rep Commission (tiered)','rep','value','tier',0,80,70,'active')
on conflict (id) do nothing;
insert into erp_cp_commission_tiers (id, plan_id, company_id, from_pct, to_pct, rate_pct) values
  ('da000000-0000-4000-8000-0000000096b1','da000000-0000-4000-8000-0000000096a1','da000000-0000-4000-8000-000000000001',0,90,2),
  ('da000000-0000-4000-8000-0000000096b2','da000000-0000-4000-8000-0000000096a1','da000000-0000-4000-8000-000000000001',90,110,4),
  ('da000000-0000-4000-8000-0000000096b3','da000000-0000-4000-8000-0000000096a1','da000000-0000-4000-8000-000000000001',110,null,6)
on conflict (id) do nothing;

-- ── ERP integration demo (mapping audit + ingest runs) ─────────────────────
insert into erp_sync_map (company_id, entity, external_id, internal_id, erp_system, source, created_via_sync, last_result, last_synced_at) values
  ('da000000-0000-4000-8000-000000000001','customer','ERP-C1','da000000-0000-4000-8000-0000000000d1','odoo','rest',true,'created', now()-interval '2 hours'),
  ('da000000-0000-4000-8000-000000000001','customer','ERP-C2','da000000-0000-4000-8000-0000000000d2','odoo','rest',true,'created', now()-interval '2 hours'),
  ('da000000-0000-4000-8000-000000000001','product','ERP-COLA','da000000-0000-4000-8000-0000000000f1','odoo','rest',true,'created', now()-interval '2 hours'),
  ('da000000-0000-4000-8000-000000000001','invoice','ERP-r1c',null,'odoo','rest',true,'created', now()-interval '1 hour')
on conflict (company_id, entity, external_id) do nothing;
insert into erp_sync_ingest_runs (id, company_id, entity, processed, created, updated, errors, status, started_at, finished_at) values
  ('da000000-0000-4000-8000-0000000091a1','da000000-0000-4000-8000-000000000001','customer',9,9,0,0,'ok', now()-interval '2 hours', now()-interval '2 hours'),
  ('da000000-0000-4000-8000-0000000091a2','da000000-0000-4000-8000-000000000001','product',4,4,0,0,'ok', now()-interval '2 hours', now()-interval '2 hours'),
  ('da000000-0000-4000-8000-0000000091a3','da000000-0000-4000-8000-000000000001','invoice',10,10,0,0,'ok', now()-interval '1 hour', now()-interval '1 hour')
on conflict (id) do nothing;

-- ── Scheduler jobs: ERP Sync / Promotion Activation / Daily Digest ─────────
insert into erp_sched_jobs (id, company_id, key, label, interval_minutes, expected_minutes, critical, enabled, last_run_at, last_status, last_duration_ms, next_run_at) values
  ('da000000-0000-4000-8000-0000000095a1','da000000-0000-4000-8000-000000000001','erp_sync','ERP Sync',60,180,true,true, now()-interval '20 minutes','ok', 540, now()+interval '40 minutes'),
  ('da000000-0000-4000-8000-0000000095a2','da000000-0000-4000-8000-000000000001','promotion_activation','Promotion Activation',1440,2880,false,true, now()-interval '6 hours','ok', 180, now()+interval '18 hours'),
  ('da000000-0000-4000-8000-0000000095a3','da000000-0000-4000-8000-000000000001','daily_digest','Daily Digest',1440,2880,false,true, now()-interval '6 hours','ok', 95, now()+interval '18 hours')
on conflict (company_id, key) do nothing;

-- ── Governance: one published config + one draft (pilot the admin) ─────────
insert into erp_cfg_feature_flags (company_id, key, kind, enabled, audience, published_at) values
  ('da000000-0000-4000-8000-000000000001','commercial_dashboard','feature',true,'{"kind":"all"}'::jsonb, now())
on conflict (company_id, key) do nothing;
insert into erp_cfg_changes (id, company_id, lineage_id, config_type, config_ref, title, payload, audience, pilot_users, state, created_by) values
  ('da000000-0000-4000-8000-0000000093a1','da000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-0000000093a1','feature_flag','beta_reports','Beta reports (pilot)','{"enabled":true,"kind":"feature"}'::jsonb,'{"kind":"all"}'::jsonb, array['da000000-0000-4000-8000-0000000000a0']::uuid[],'draft','da000000-0000-4000-8000-0000000000a0')
on conflict (id) do nothing;
