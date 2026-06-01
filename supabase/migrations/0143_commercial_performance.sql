-- ============================================================================
-- 0143: Commercial Performance Pack (CP-3) — performance layer
-- ----------------------------------------------------------------------------
-- Joins source-aware actuals (CP-1/2) to targets (CP-2) across every dimension
-- and returns, per dimension key, VALUE and QUANTITY blocks kept strictly
-- separate (never mixed): actual, target, achievement %, RAG status, plus
-- prior-period and YoY growth. RAG thresholds are configurable per company
-- (green ≥ 100, amber ≥ 90 by default). Scope is mandatory throughout
-- (Effective = User Scope AND Selected Filters): a manager sees their team's
-- actuals; targets appear only where in scope (broad dims → admin).
-- ============================================================================

-- ── Configurable RAG thresholds (on the existing per-company settings) ─────
alter table erp_cp_settings add column if not exists rag_green numeric not null default 100;  -- achievement % ≥ green → green
alter table erp_cp_settings add column if not exists rag_amber numeric not null default 90;   -- ≥ amber → amber, else red

create or replace function erp_cp_rag(p_ach numeric, p_company uuid)
returns text language sql stable security definer set search_path to 'public','pg_temp' as $$
  select case when p_ach is null then null
    when p_ach >= coalesce((select rag_green from erp_cp_settings where company_id = p_company), 100) then 'green'
    when p_ach >= coalesce((select rag_amber from erp_cp_settings where company_id = p_company), 90) then 'amber'
    else 'red' end;
$$;
revoke all on function erp_cp_rag(numeric, uuid) from public, anon; grant execute on function erp_cp_rag(numeric, uuid) to authenticated;

-- ── Performance by dimension: actual vs target + achievement + growth + RAG ─
-- p_month: any day in the target month. group_by ∈ company|region|area|branch|
-- route|rep|customer|channel|classification|category|subcategory|brand|sku.
create or replace function erp_cp_performance(
  p_month date, p_group_by text default 'rep',
  p_rep uuid default null, p_route uuid default null, p_branch uuid default null,
  p_region text default null, p_area text default null, p_channel text default null,
  p_classification text default null, p_category uuid default null, p_source text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v jsonb; v_all boolean := erp_fe_sees_all(); v_team uuid[] := array(select erp_fe_team());
  v_g text := coalesce(p_group_by,'rep'); v_src text := coalesce(p_source, erp_cp_primary_source(v_company));
  cur_from date := date_trunc('month', p_month)::date; cur_to date; prev_from date; prev_to date; yoy_from date; yoy_to date;
begin
  if v_company is null then return '[]'::jsonb; end if;
  if v_g not in ('company','region','area','branch','route','rep','customer','channel','classification','category','subcategory','brand','sku') then v_g := 'rep'; end if;
  cur_to := (cur_from + interval '1 month - 1 day')::date;
  prev_from := (cur_from - interval '1 month')::date; prev_to := (cur_from - interval '1 day')::date;
  yoy_from := (cur_from - interval '1 year')::date;   yoy_to := (yoy_from + interval '1 month - 1 day')::date;

  with f as (
    select
      case v_g when 'rep' then s.rep_id::text when 'route' then s.route_id::text when 'branch' then s.branch_id::text
        when 'area' then s.area when 'region' then s.region when 'category' then s.category_id::text
        when 'subcategory' then s.subcategory_id::text when 'brand' then s.brand when 'sku' then s.sku when 'channel' then s.channel
        when 'classification' then s.classification when 'customer' then s.customer_id::text else 'all' end as key,
      case v_g when 'rep' then rp.full_name when 'route' then rt.name when 'branch' then br.name
        when 'area' then s.area when 'region' then s.region when 'category' then s.category_name
        when 'subcategory' then s.subcategory_name when 'brand' then s.brand when 'sku' then s.product_name when 'channel' then s.channel
        when 'classification' then s.classification when 'customer' then s.customer_name else 'Company' end as label,
      s.value, s.qty, s.fact_date
    from erp_cp_sales_facts s
    left join erp_profiles rp on rp.id = s.rep_id and v_g='rep'
    left join erp_routes rt on rt.id = s.route_id and v_g='route'
    left join erp_branches br on br.id = s.branch_id and v_g='branch'
    where s.company_id = v_company and (v_src='all' or s.source = v_src) and s.fact_date between yoy_from and cur_to
      and (v_all or s.rep_id = any(v_team))
      and (p_rep is null or s.rep_id = p_rep) and (p_route is null or s.route_id = p_route) and (p_branch is null or s.branch_id = p_branch)
      and (p_region is null or s.region = p_region) and (p_area is null or s.area = p_area) and (p_channel is null or s.channel = p_channel)
      and (p_classification is null or s.classification = p_classification) and (p_category is null or s.category_id = p_category)),
  agg as (
    select key, max(label) label,
      coalesce(sum(value) filter (where fact_date between cur_from and cur_to),0) cur_v,
      coalesce(sum(qty)   filter (where fact_date between cur_from and cur_to),0) cur_q,
      coalesce(sum(value) filter (where fact_date between prev_from and prev_to),0) prev_v,
      coalesce(sum(qty)   filter (where fact_date between prev_from and prev_to),0) prev_q,
      coalesce(sum(value) filter (where fact_date between yoy_from and yoy_to),0) yoy_v,
      coalesce(sum(qty)   filter (where fact_date between yoy_from and yoy_to),0) yoy_q
    from f group by key),
  tgt as (
    select case when v_g='company' then 'all' else coalesce(dim_id,'') end key,
      max(target_amount) filter (where metric='value') tv, max(target_amount) filter (where metric='quantity') tq
    from erp_cp_targets t
    where company_id=v_company and period_month=cur_from and dim_type=v_g and status in ('approved','active')
      and (v_all or (v_g='rep' and dim_id = any(v_team::text[]))
        or (v_g='route' and (select rep_id from erp_routes where id=nullif(dim_id,'')::uuid) = any(v_team))
        or (v_g='customer' and (select salesman_id from erp_customers where id=nullif(dim_id,'')::uuid) = any(v_team)))
    group by 1),
  m as (
    select coalesce(a.key, t.key) key, coalesce(a.label, erp_cp_dim_label(v_g, t.key)) label,
      coalesce(a.cur_v,0) cur_v, coalesce(a.cur_q,0) cur_q, coalesce(a.prev_v,0) prev_v, coalesce(a.prev_q,0) prev_q,
      coalesce(a.yoy_v,0) yoy_v, coalesce(a.yoy_q,0) yoy_q, t.tv, t.tq
    from agg a full outer join tgt t on a.key = t.key)
  select coalesce(jsonb_agg(jsonb_build_object('key', key, 'label', label,
    'value', jsonb_build_object('actual', round(cur_v,2), 'target', tv,
      'achievement', case when tv>0 then round(100*cur_v/tv) end, 'rag', erp_cp_rag(case when tv>0 then 100*cur_v/tv end, v_company),
      'prior', round(prev_v,2), 'prior_growth', case when prev_v>0 then round((100*(cur_v-prev_v)/prev_v)::numeric,1) end,
      'yoy', round(yoy_v,2), 'yoy_growth', case when yoy_v>0 then round((100*(cur_v-yoy_v)/yoy_v)::numeric,1) end),
    'qty', jsonb_build_object('actual', cur_q, 'target', tq,
      'achievement', case when tq>0 then round(100*cur_q/tq) end, 'rag', erp_cp_rag(case when tq>0 then 100*cur_q/tq end, v_company),
      'prior', prev_q, 'prior_growth', case when prev_q>0 then round((100*(cur_q-prev_q)/prev_q)::numeric,1) end,
      'yoy', yoy_q, 'yoy_growth', case when yoy_q>0 then round((100*(cur_q-yoy_q)/yoy_q)::numeric,1) end))
    order by cur_v desc), '[]'::jsonb) into v from m;
  return v;
end; $$;
revoke all on function erp_cp_performance(date,text,uuid,uuid,uuid,text,text,text,text,uuid,text) from public, anon;
grant execute on function erp_cp_performance(date,text,uuid,uuid,uuid,text,text,text,text,uuid,text) to authenticated;

-- ============================================================================
-- ROLLBACK (manual): drop erp_cp_performance, erp_cp_rag; drop erp_cp_settings
-- rag_green / rag_amber.
-- ============================================================================
