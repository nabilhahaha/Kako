-- ============================================================================
-- 0140: Commercial Performance Pack (CP-1) — Sales Actuals Integration
-- ----------------------------------------------------------------------------
-- A single normalized, scope-aware "sales fact" stream that every commercial
-- metric (achievement, growth, category/channel/classification performance,
-- commission, incentive) builds on. Phase-1 source = recognized invoice lines
-- (erp_invoices status not draft/cancelled, joined erp_invoice_lines), so all
-- breakdowns reconcile to the same rep/customer totals. Later sources (orders,
-- POS) can UNION into the view without touching consumers.
--
-- Attribution (FMCG-standard): rep = customer.salesman_id, route =
-- customer.route_id, branch = invoice.branch_id, region/area = branch.*,
-- channel/classification = customer.*, SKU = product.code, subcategory =
-- product.category_id, category = its parent (or itself if top-level),
-- value = invoice_line.line_total, qty = invoice_line.quantity.
--
-- Scope reuses the org hierarchy helpers erp_fe_team()/erp_fe_sees_all():
-- managers see their reporting subtree, a rep sees their own, admins see all.
-- ============================================================================

-- ── Normalized sales facts (internal; consumed only by security-definer fns) ─
create or replace view erp_cp_sales_facts as
  select
    b.company_id,
    i.created_at::date            as fact_date,
    i.id                          as invoice_id,
    cu.salesman_id                as rep_id,
    cu.route_id                   as route_id,
    i.branch_id                   as branch_id,
    b.region                      as region,
    b.area                        as area,
    cu.channel                    as channel,
    cu.classification             as classification,
    i.customer_id                 as customer_id,
    cu.name                       as customer_name,
    il.product_id                 as product_id,
    p.code                        as sku,
    p.name                        as product_name,
    p.category_id                 as subcategory_id,
    sc.name                       as subcategory_name,
    coalesce(sc.parent_id, p.category_id)            as category_id,
    coalesce(pc.name, sc.name)                       as category_name,
    coalesce(il.quantity, 0)      as qty,
    coalesce(il.line_total, 0)    as value
  from erp_invoices i
  join erp_branches b              on b.id = i.branch_id
  join erp_customers cu            on cu.id = i.customer_id
  join erp_invoice_lines il        on il.invoice_id = i.id
  left join erp_products_catalog p on p.id = il.product_id
  left join erp_product_categories sc on sc.id = p.category_id
  left join erp_product_categories pc on pc.id = sc.parent_id
  where i.status::text not in ('draft', 'cancelled');

revoke all on erp_cp_sales_facts from public, anon, authenticated;

-- ── Aggregated actuals by any dimension (Effective = Scope AND Filters) ─────
-- p_group_by ∈ rep|route|branch|area|region|category|subcategory|sku|channel|
-- classification|customer|none. Returns [{key,label,value,qty,lines}] desc by value.
create or replace function erp_cp_actuals(
  p_from date, p_to date, p_group_by text default 'rep',
  p_rep uuid default null, p_route uuid default null, p_branch uuid default null,
  p_region text default null, p_area text default null, p_channel text default null,
  p_classification text default null, p_category uuid default null)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v jsonb; v_all boolean := erp_fe_sees_all(); v_team uuid[] := array(select erp_fe_team());
  v_g text := coalesce(p_group_by, 'rep');
begin
  if v_company is null then return '[]'::jsonb; end if;
  if v_g not in ('rep','route','branch','area','region','category','subcategory','sku','channel','classification','customer','none') then v_g := 'rep'; end if;
  with f as (
    select * from erp_cp_sales_facts s
    where s.company_id = v_company and s.fact_date between p_from and p_to
      and (v_all or s.rep_id = any(v_team))                       -- hierarchy scope
      and (p_rep is null or s.rep_id = p_rep)                     -- filters (AND)
      and (p_route is null or s.route_id = p_route)
      and (p_branch is null or s.branch_id = p_branch)
      and (p_region is null or s.region = p_region)
      and (p_area is null or s.area = p_area)
      and (p_channel is null or s.channel = p_channel)
      and (p_classification is null or s.classification = p_classification)
      and (p_category is null or s.category_id = p_category)),
  g as (
    select
      case v_g when 'rep' then s.rep_id::text when 'route' then s.route_id::text when 'branch' then s.branch_id::text
        when 'area' then s.area when 'region' then s.region when 'category' then s.category_id::text
        when 'subcategory' then s.subcategory_id::text when 'sku' then s.sku when 'channel' then s.channel
        when 'classification' then s.classification when 'customer' then s.customer_id::text else 'all' end as key,
      case v_g when 'rep' then rp.full_name when 'route' then rt.name when 'branch' then br.name
        when 'area' then s.area when 'region' then s.region when 'category' then s.category_name
        when 'subcategory' then s.subcategory_name when 'sku' then s.product_name when 'channel' then s.channel
        when 'classification' then s.classification when 'customer' then s.customer_name else 'all' end as label,
      s.value, s.qty, s.invoice_id
    from f s
    left join erp_profiles rp on rp.id = s.rep_id and v_g = 'rep'
    left join erp_routes rt on rt.id = s.route_id and v_g = 'route'
    left join erp_branches br on br.id = s.branch_id and v_g = 'branch')
  select coalesce(jsonb_agg(jsonb_build_object('key', key, 'label', label,
      'value', round(value,2), 'qty', qty, 'lines', lines) order by value desc nulls last), '[]'::jsonb)
  into v from (
    select key, max(label) label, sum(value) value, sum(qty) qty, count(distinct invoice_id) lines
    from g group by key) z;
  return v;
end; $$;
revoke all on function erp_cp_actuals(date,date,text,uuid,uuid,uuid,text,text,text,text,uuid) from public, anon;
grant execute on function erp_cp_actuals(date,date,text,uuid,uuid,uuid,text,text,text,text,uuid) to authenticated;

-- ── Scalar totals for the same scope/filters (KPI header) ──────────────────
create or replace function erp_cp_actuals_total(
  p_from date, p_to date, p_rep uuid default null, p_route uuid default null, p_branch uuid default null,
  p_region text default null, p_area text default null, p_channel text default null,
  p_classification text default null, p_category uuid default null)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v jsonb; v_all boolean := erp_fe_sees_all(); v_team uuid[] := array(select erp_fe_team());
begin
  if v_company is null then return null; end if;
  select jsonb_build_object('value', round(coalesce(sum(s.value),0),2), 'qty', coalesce(sum(s.qty),0),
    'invoices', count(distinct s.invoice_id), 'customers', count(distinct s.customer_id)) into v
  from erp_cp_sales_facts s
  where s.company_id = v_company and s.fact_date between p_from and p_to
    and (v_all or s.rep_id = any(v_team))
    and (p_rep is null or s.rep_id = p_rep) and (p_route is null or s.route_id = p_route) and (p_branch is null or s.branch_id = p_branch)
    and (p_region is null or s.region = p_region) and (p_area is null or s.area = p_area) and (p_channel is null or s.channel = p_channel)
    and (p_classification is null or s.classification = p_classification) and (p_category is null or s.category_id = p_category);
  return v;
end; $$;
revoke all on function erp_cp_actuals_total(date,date,uuid,uuid,uuid,text,text,text,text,uuid) from public, anon;
grant execute on function erp_cp_actuals_total(date,date,uuid,uuid,uuid,text,text,text,text,uuid) to authenticated;

-- ============================================================================
-- ROLLBACK (manual): drop erp_cp_actuals / _total; drop view erp_cp_sales_facts.
-- ============================================================================
