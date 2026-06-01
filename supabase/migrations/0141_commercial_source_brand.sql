-- ============================================================================
-- 0141: Commercial Performance Pack (CP-2a) — configurable actuals source + Brand
-- ----------------------------------------------------------------------------
-- Per-company choice of what counts as an "actual": recognized invoices, confirmed
-- sales orders, or both (default invoices). All commercial metrics resolve to the
-- company's setting; comparison views can request a specific source explicitly
-- (the hook for a future Ordered vs Invoiced + Conversion% dashboard). Also adds
-- an optional Brand dimension to the product catalog and threads it through facts.
-- ============================================================================

-- ── Per-company commercial settings ────────────────────────────────────────
create table if not exists erp_cp_settings (
  company_id     uuid primary key references erp_companies(id) on delete cascade,
  actuals_source text not null default 'invoices' check (actuals_source in ('invoices','sales_orders','both')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table erp_cp_settings enable row level security;
drop policy if exists erp_cp_settings_read on erp_cp_settings;
create policy erp_cp_settings_read on erp_cp_settings for select using (
  (select erp_is_platform_owner()) or company_id = (select erp_user_company_id()));
drop policy if exists erp_cp_settings_write on erp_cp_settings;
create policy erp_cp_settings_write on erp_cp_settings for all using (
  (select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))
) with check ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id)));
drop trigger if exists erp_cp_settings_updated on erp_cp_settings;
create trigger erp_cp_settings_updated before update on erp_cp_settings for each row execute function erp_set_updated_at();

-- configured source (invoices|sales_orders|both); primary single-number source (invoice|order)
create or replace function erp_cp_source(p_company uuid) returns text language sql stable security definer set search_path to 'public','pg_temp' as $$
  select coalesce((select actuals_source from erp_cp_settings where company_id = p_company), 'invoices');
$$;
create or replace function erp_cp_primary_source(p_company uuid) returns text language sql stable security definer set search_path to 'public','pg_temp' as $$
  select case when erp_cp_source(p_company) = 'sales_orders' then 'order' else 'invoice' end;
$$;
revoke all on function erp_cp_source(uuid) from public, anon; grant execute on function erp_cp_source(uuid) to authenticated;
revoke all on function erp_cp_primary_source(uuid) from public, anon; grant execute on function erp_cp_primary_source(uuid) to authenticated;

-- ── Brand dimension on the catalog (optional; degrades to empty) ────────────
alter table erp_products_catalog add column if not exists brand text;

-- ── Rebuild facts as invoice ∪ confirmed-order, tagged with `source` + brand ─
drop view if exists erp_cp_sales_facts;
create view erp_cp_sales_facts as
  -- recognized invoices
  select 'invoice'::text as source, b.company_id, i.created_at::date as fact_date, i.id as doc_id,
    cu.salesman_id as rep_id, cu.route_id, i.branch_id, b.region, b.area, cu.channel, cu.classification,
    i.customer_id, cu.name as customer_name, il.product_id, p.code as sku, p.name as product_name, p.brand,
    p.category_id as subcategory_id, sc.name as subcategory_name,
    coalesce(sc.parent_id, p.category_id) as category_id, coalesce(pc.name, sc.name) as category_name,
    coalesce(il.quantity,0) as qty, coalesce(il.line_total,0) as value
  from erp_invoices i
  join erp_branches b on b.id = i.branch_id
  join erp_customers cu on cu.id = i.customer_id
  join erp_invoice_lines il on il.invoice_id = i.id
  left join erp_products_catalog p on p.id = il.product_id
  left join erp_product_categories sc on sc.id = p.category_id
  left join erp_product_categories pc on pc.id = sc.parent_id
  where i.status::text not in ('draft','cancelled')
  union all
  -- confirmed sales orders
  select 'order'::text, b.company_id, so.created_at::date, so.id,
    coalesce(so.salesman_id, cu.salesman_id), cu.route_id, so.branch_id, b.region, b.area, cu.channel, cu.classification,
    so.customer_id, cu.name, sol.product_id, p.code, p.name, p.brand,
    p.category_id, sc.name, coalesce(sc.parent_id, p.category_id), coalesce(pc.name, sc.name),
    coalesce(sol.quantity,0), coalesce(sol.line_total,0)
  from erp_sales_orders so
  join erp_branches b on b.id = so.branch_id
  join erp_customers cu on cu.id = so.customer_id
  join erp_sales_order_lines sol on sol.sales_order_id = so.id
  left join erp_products_catalog p on p.id = sol.product_id
  left join erp_product_categories sc on sc.id = p.category_id
  left join erp_product_categories pc on pc.id = sc.parent_id
  where so.status::text in ('confirmed','invoiced');
revoke all on erp_cp_sales_facts from public, anon, authenticated;

-- ── Aggregated actuals (source-aware; + brand dimension) ───────────────────
-- p_source: null → company primary; 'invoice' | 'order' | 'all' (comparison).
create or replace function erp_cp_actuals(
  p_from date, p_to date, p_group_by text default 'rep',
  p_rep uuid default null, p_route uuid default null, p_branch uuid default null,
  p_region text default null, p_area text default null, p_channel text default null,
  p_classification text default null, p_category uuid default null, p_source text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v jsonb; v_all boolean := erp_fe_sees_all(); v_team uuid[] := array(select erp_fe_team());
  v_g text := coalesce(p_group_by,'rep'); v_src text := coalesce(p_source, erp_cp_primary_source(v_company));
begin
  if v_company is null then return '[]'::jsonb; end if;
  if v_g not in ('rep','route','branch','area','region','category','subcategory','brand','sku','channel','classification','customer','none') then v_g := 'rep'; end if;
  with f as (
    select * from erp_cp_sales_facts s
    where s.company_id = v_company and s.fact_date between p_from and p_to
      and (v_src = 'all' or s.source = v_src)
      and (v_all or s.rep_id = any(v_team))
      and (p_rep is null or s.rep_id = p_rep) and (p_route is null or s.route_id = p_route) and (p_branch is null or s.branch_id = p_branch)
      and (p_region is null or s.region = p_region) and (p_area is null or s.area = p_area) and (p_channel is null or s.channel = p_channel)
      and (p_classification is null or s.classification = p_classification) and (p_category is null or s.category_id = p_category)),
  g as (
    select
      case v_g when 'rep' then s.rep_id::text when 'route' then s.route_id::text when 'branch' then s.branch_id::text
        when 'area' then s.area when 'region' then s.region when 'category' then s.category_id::text
        when 'subcategory' then s.subcategory_id::text when 'brand' then s.brand when 'sku' then s.sku when 'channel' then s.channel
        when 'classification' then s.classification when 'customer' then s.customer_id::text else 'all' end as key,
      case v_g when 'rep' then rp.full_name when 'route' then rt.name when 'branch' then br.name
        when 'area' then s.area when 'region' then s.region when 'category' then s.category_name
        when 'subcategory' then s.subcategory_name when 'brand' then s.brand when 'sku' then s.product_name when 'channel' then s.channel
        when 'classification' then s.classification when 'customer' then s.customer_name else 'all' end as label,
      s.value, s.qty, s.doc_id
    from f s
    left join erp_profiles rp on rp.id = s.rep_id and v_g = 'rep'
    left join erp_routes rt on rt.id = s.route_id and v_g = 'route'
    left join erp_branches br on br.id = s.branch_id and v_g = 'branch')
  select coalesce(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', round(value,2), 'qty', qty, 'docs', docs) order by value desc nulls last), '[]'::jsonb)
  into v from (select key, max(label) label, sum(value) value, sum(qty) qty, count(distinct doc_id) docs from g group by key) z;
  return v;
end; $$;
revoke all on function erp_cp_actuals(date,date,text,uuid,uuid,uuid,text,text,text,text,uuid,text) from public, anon;
grant execute on function erp_cp_actuals(date,date,text,uuid,uuid,uuid,text,text,text,text,uuid,text) to authenticated;

create or replace function erp_cp_actuals_total(
  p_from date, p_to date, p_rep uuid default null, p_route uuid default null, p_branch uuid default null,
  p_region text default null, p_area text default null, p_channel text default null,
  p_classification text default null, p_category uuid default null, p_source text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v jsonb; v_all boolean := erp_fe_sees_all(); v_team uuid[] := array(select erp_fe_team());
  v_src text := coalesce(p_source, erp_cp_primary_source(v_company));
begin
  if v_company is null then return null; end if;
  select jsonb_build_object('value', round(coalesce(sum(s.value),0),2), 'qty', coalesce(sum(s.qty),0),
    'docs', count(distinct s.doc_id), 'customers', count(distinct s.customer_id), 'source', v_src) into v
  from erp_cp_sales_facts s
  where s.company_id = v_company and s.fact_date between p_from and p_to and (v_src='all' or s.source = v_src) and (v_all or s.rep_id = any(v_team))
    and (p_rep is null or s.rep_id = p_rep) and (p_route is null or s.route_id = p_route) and (p_branch is null or s.branch_id = p_branch)
    and (p_region is null or s.region = p_region) and (p_area is null or s.area = p_area) and (p_channel is null or s.channel = p_channel)
    and (p_classification is null or s.classification = p_classification) and (p_category is null or s.category_id = p_category);
  return v;
end; $$;
revoke all on function erp_cp_actuals_total(date,date,uuid,uuid,uuid,text,text,text,text,uuid,text) from public, anon;
grant execute on function erp_cp_actuals_total(date,date,uuid,uuid,uuid,text,text,text,text,uuid,text) to authenticated;

-- old erp_cp_actuals_total(…,uuid) 11-arg from 0140 is replaced (different arg count → drop legacy)
drop function if exists erp_cp_actuals_total(date,date,uuid,uuid,uuid,text,text,text,text,uuid);
drop function if exists erp_cp_actuals(date,date,text,uuid,uuid,uuid,text,text,text,text,uuid);

-- ============================================================================
-- ROLLBACK (manual): restore 0140 view + functions; drop erp_cp_settings,
-- erp_cp_source/_primary_source; drop erp_products_catalog.brand.
-- ============================================================================
