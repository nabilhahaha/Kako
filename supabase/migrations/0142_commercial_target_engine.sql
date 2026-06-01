-- ============================================================================
-- 0142: Commercial Performance Pack (CP-2b) — Target Engine
-- ----------------------------------------------------------------------------
-- Multi-dimension targets (company→…→SKU incl. Brand), value + quantity metric,
-- lifecycle (draft→approved→active→archived). Manual entry + Excel/CSV import
-- (with pre-commit validation) + export. Validation prevents duplicate targets
-- for the same dimension/month/metric and flags overlapping levels in a rollup
-- chain. Rollups: SKU→Brand→Sub-category→Category→Total and
-- Customer→Route→Area→Region→Company.
--
-- Scope (mandatory): a manager may only create / edit / import / view targets
-- within their hierarchy scope (erp_fe_team) — rep/route/customer targets are
-- scope-checked; broad/aggregate dims require admin (erp_fe_sees_all). Reads are
-- Effective = User Scope AND Selected Filters.
-- ============================================================================

create table if not exists erp_cp_targets (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references erp_companies(id) on delete cascade,
  period_month  date not null,                       -- first day of month
  dim_type      text not null check (dim_type in ('company','region','area','branch','route','rep','channel','classification','customer','category','subcategory','brand','sku')),
  dim_id        text,                                -- uuid::text for entities; literal for region/area/channel/classification/brand/sku; null for company
  metric        text not null check (metric in ('value','quantity')),
  target_amount numeric not null default 0,
  status        text not null default 'draft' check (status in ('draft','approved','active','archived')),
  notes         text,
  created_by    uuid, approved_by uuid, approved_at timestamptz,
  created_at    timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- one non-archived target per (month, dimension node, metric)
create unique index if not exists uq_cp_targets on erp_cp_targets(company_id, period_month, dim_type, (coalesce(dim_id,'')), metric) where status <> 'archived';
create index if not exists idx_cp_targets_lookup on erp_cp_targets(company_id, period_month, dim_type, status);
alter table erp_cp_targets enable row level security;
-- raw SELECT: admins (sees_all) or a rep's own rep-target; everyone else reads via the scoped function
drop policy if exists erp_cp_targets_read on erp_cp_targets;
create policy erp_cp_targets_read on erp_cp_targets for select using (
  (select erp_is_platform_owner()) or (company_id = (select erp_user_company_id()) and ((select erp_fe_sees_all())
    or (dim_type = 'rep' and dim_id = (select auth.uid())::text))));
drop policy if exists erp_cp_targets_write on erp_cp_targets;
create policy erp_cp_targets_write on erp_cp_targets for all using (
  (select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))
) with check ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id)));
drop trigger if exists trg_audit_erp_cp_targets on erp_cp_targets;
create trigger trg_audit_erp_cp_targets after insert or update or delete on erp_cp_targets for each row execute function erp_audit_capture();
drop trigger if exists erp_cp_targets_updated on erp_cp_targets;
create trigger erp_cp_targets_updated before update on erp_cp_targets for each row execute function erp_set_updated_at();

-- ── Scope check for a single target node ───────────────────────────────────
create or replace function erp_cp_target_in_scope(p_dim_type text, p_dim_id text)
returns boolean language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_team uuid[] := array(select erp_fe_team());
begin
  if erp_fe_sees_all() then return true; end if;
  if p_dim_id is null then return false; end if;
  return case p_dim_type
    when 'rep'      then p_dim_id::uuid = any(v_team)
    when 'route'    then (select rep_id from erp_routes where id = p_dim_id::uuid) = any(v_team)
    when 'customer' then (select salesman_id from erp_customers where id = p_dim_id::uuid) = any(v_team)
    else false end;   -- broad/aggregate dims require admin
exception when others then return false; end; $$;
revoke all on function erp_cp_target_in_scope(text, text) from public, anon; grant execute on function erp_cp_target_in_scope(text, text) to authenticated;

-- ── Create / update a single target (upsert; duplicates fold into an update) ─
create or replace function erp_cp_target_save(
  p_period date, p_dim_type text, p_dim_id text, p_metric text, p_amount numeric,
  p_status text default 'draft', p_notes text default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_period date := date_trunc('month', p_period)::date; v_id uuid; v_uid uuid := (select auth.uid());
begin
  if v_company is null then raise exception 'forbidden'; end if;
  if p_metric not in ('value','quantity') then raise exception 'bad metric'; end if;
  if coalesce(p_status,'draft') not in ('draft','approved','active','archived') then raise exception 'bad status'; end if;
  if not erp_cp_target_in_scope(p_dim_type, p_dim_id) then raise exception 'out of scope'; end if;
  insert into erp_cp_targets (company_id, period_month, dim_type, dim_id, metric, target_amount, status, notes, created_by,
      approved_by, approved_at)
    values (v_company, v_period, p_dim_type, nullif(p_dim_id,''), p_metric, coalesce(p_amount,0), coalesce(p_status,'draft'), p_notes, v_uid,
      case when p_status in ('approved','active') then v_uid end, case when p_status in ('approved','active') then now() end)
  on conflict (company_id, period_month, dim_type, (coalesce(dim_id,'')), metric) where status <> 'archived'
  do update set target_amount = excluded.target_amount, status = excluded.status, notes = coalesce(excluded.notes, erp_cp_targets.notes),
    approved_by = case when excluded.status in ('approved','active') then v_uid else erp_cp_targets.approved_by end,
    approved_at = case when excluded.status in ('approved','active') then now() else erp_cp_targets.approved_at end, updated_at = now()
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end; $$;
revoke all on function erp_cp_target_save(date,text,text,text,numeric,text,text) from public, anon; grant execute on function erp_cp_target_save(date,text,text,text,numeric,text,text) to authenticated;

-- ── Lifecycle transition (scope-checked) ───────────────────────────────────
create or replace function erp_cp_target_set_status(p_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); r erp_cp_targets;
begin
  if v_company is null then raise exception 'forbidden'; end if;
  if p_status not in ('draft','approved','active','archived') then raise exception 'bad status'; end if;
  select * into r from erp_cp_targets where id = p_id and company_id = v_company;
  if not found then raise exception 'not found'; end if;
  if not erp_cp_target_in_scope(r.dim_type, r.dim_id) then raise exception 'out of scope'; end if;
  update erp_cp_targets set status = p_status,
    approved_by = case when p_status in ('approved','active') then (select auth.uid()) else approved_by end,
    approved_at = case when p_status in ('approved','active') then now() else approved_at end, updated_at = now()
    where id = p_id;
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function erp_cp_target_set_status(uuid, text) from public, anon; grant execute on function erp_cp_target_set_status(uuid, text) to authenticated;

-- ── Validate a batch BEFORE import (duplicates, overlaps, scope, shape) ─────
-- p_rows: [{period, dim_type, dim_id, metric, amount}]. Returns issues:
-- [{row, level:'error'|'warning', code, message}]. row is 1-based.
create or replace function erp_cp_targets_validate(p_rows jsonb)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); issues jsonb := '[]'::jsonb; r jsonb; idx int := 0;
  v_dim text; v_id text; v_metric text; v_period date; v_amount numeric; seen text[] := '{}'; k text;
  geo text[] := array['company','region','area','branch','route','customer','rep']; prod text[] := array['category','subcategory','brand','sku'];
begin
  if v_company is null then raise exception 'forbidden'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    idx := idx + 1; v_dim := r->>'dim_type'; v_id := nullif(r->>'dim_id',''); v_metric := r->>'metric';
    begin v_period := date_trunc('month', (r->>'period')::date)::date; exception when others then v_period := null; end;
    begin v_amount := (r->>'amount')::numeric; exception when others then v_amount := null; end;
    if v_dim is null or v_dim not in ('company','region','area','branch','route','rep','channel','classification','customer','category','subcategory','brand','sku') then
      issues := issues || jsonb_build_object('row', idx, 'level','error','code','bad_dim','message','Unknown dimension'); continue; end if;
    if v_metric not in ('value','quantity') then issues := issues || jsonb_build_object('row', idx,'level','error','code','bad_metric','message','Metric must be value or quantity'); continue; end if;
    if v_period is null then issues := issues || jsonb_build_object('row', idx,'level','error','code','bad_period','message','Invalid period'); continue; end if;
    if v_amount is null or v_amount < 0 then issues := issues || jsonb_build_object('row', idx,'level','error','code','bad_amount','message','Amount must be ≥ 0'); continue; end if;
    if not erp_cp_target_in_scope(v_dim, v_id) then issues := issues || jsonb_build_object('row', idx,'level','error','code','out_of_scope','message','Outside your scope'); continue; end if;
    k := v_period::text||'|'||v_dim||'|'||coalesce(v_id,'')||'|'||v_metric;
    if k = any(seen) then issues := issues || jsonb_build_object('row', idx,'level','error','code','dup_in_batch','message','Duplicate row in this import'); continue; end if;
    seen := seen || k;
    if exists(select 1 from erp_cp_targets t where t.company_id=v_company and t.period_month=v_period and t.dim_type=v_dim and coalesce(t.dim_id,'')=coalesce(v_id,'') and t.metric=v_metric and t.status<>'archived') then
      issues := issues || jsonb_build_object('row', idx,'level','error','code','duplicate','message','A target already exists for this dimension/month'); continue; end if;
    -- overlap (warning): another level of the same rollup chain already has a target this month+metric
    if (v_dim = any(geo) and exists(select 1 from erp_cp_targets t where t.company_id=v_company and t.period_month=v_period and t.metric=v_metric and t.status<>'archived' and t.dim_type = any(geo) and t.dim_type <> v_dim))
    or (v_dim = any(prod) and exists(select 1 from erp_cp_targets t where t.company_id=v_company and t.period_month=v_period and t.metric=v_metric and t.status<>'archived' and t.dim_type = any(prod) and t.dim_type <> v_dim)) then
      issues := issues || jsonb_build_object('row', idx,'level','warning','code','overlap','message','Overlaps targets at another level of the same chain'); end if;
  end loop;
  return issues;
end; $$;
revoke all on function erp_cp_targets_validate(jsonb) from public, anon; grant execute on function erp_cp_targets_validate(jsonb) to authenticated;

-- ── Import a batch (validate-then-commit; no write if any error) ───────────
create or replace function erp_cp_targets_import(p_rows jsonb, p_status text default 'draft')
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_issues jsonb; r jsonb; n int := 0;
begin
  if v_company is null then raise exception 'forbidden'; end if;
  v_issues := erp_cp_targets_validate(p_rows);
  if exists(select 1 from jsonb_array_elements(v_issues) e where e->>'level' = 'error') then
    return jsonb_build_object('ok', false, 'imported', 0, 'issues', v_issues); end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    perform erp_cp_target_save((r->>'period')::date, r->>'dim_type', nullif(r->>'dim_id',''), r->>'metric', (r->>'amount')::numeric, coalesce(p_status,'draft'), nullif(r->>'notes',''));
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'imported', n, 'issues', v_issues);   -- issues = warnings only
end; $$;
revoke all on function erp_cp_targets_import(jsonb, text) from public, anon; grant execute on function erp_cp_targets_import(jsonb, text) to authenticated;

-- ── Scoped list / export (Effective = Scope AND Filters) ───────────────────
create or replace function erp_cp_targets_list(p_period date default null, p_dim_type text default null, p_status text default null, p_metric text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v jsonb; v_all boolean := erp_fe_sees_all(); v_team uuid[] := array(select erp_fe_team());
  v_period date := case when p_period is null then null else date_trunc('month', p_period)::date end;
begin
  if v_company is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'period_month', t.period_month, 'dim_type', t.dim_type, 'dim_id', t.dim_id,
      'label', erp_cp_dim_label(t.dim_type, t.dim_id), 'metric', t.metric, 'target_amount', t.target_amount, 'status', t.status,
      'notes', t.notes, 'approved_by', t.approved_by, 'approved_at', t.approved_at, 'created_at', t.created_at)
    order by t.period_month desc, t.dim_type), '[]'::jsonb) into v
  from erp_cp_targets t
  where t.company_id = v_company
    and (v_all                                                    -- scope
      or (t.dim_type='rep' and t.dim_id = any(v_team::text[]))
      or (t.dim_type='route' and (select rep_id from erp_routes where id = nullif(t.dim_id,'')::uuid) = any(v_team))
      or (t.dim_type='customer' and (select salesman_id from erp_customers where id = nullif(t.dim_id,'')::uuid) = any(v_team)))
    and (v_period is null or t.period_month = v_period)           -- filters (AND)
    and (p_dim_type is null or t.dim_type = p_dim_type)
    and (p_status is null or t.status = p_status)
    and (p_metric is null or t.metric = p_metric);
  return v;
end; $$;
revoke all on function erp_cp_targets_list(date,text,text,text) from public, anon; grant execute on function erp_cp_targets_list(date,text,text,text) to authenticated;

-- dimension label resolver (entity name or literal)
create or replace function erp_cp_dim_label(p_dim_type text, p_dim_id text)
returns text language sql stable security definer set search_path to 'public','pg_temp' as $$
  select case p_dim_type
    when 'company' then 'Company'
    when 'rep' then (select full_name from erp_profiles where id = nullif(p_dim_id,'')::uuid)
    when 'route' then (select name from erp_routes where id = nullif(p_dim_id,'')::uuid)
    when 'branch' then (select name from erp_branches where id = nullif(p_dim_id,'')::uuid)
    when 'customer' then (select name from erp_customers where id = nullif(p_dim_id,'')::uuid)
    when 'category' then (select name from erp_product_categories where id = nullif(p_dim_id,'')::uuid)
    when 'subcategory' then (select name from erp_product_categories where id = nullif(p_dim_id,'')::uuid)
    else p_dim_id end;
$$;
revoke all on function erp_cp_dim_label(text, text) from public, anon; grant execute on function erp_cp_dim_label(text, text) to authenticated;

-- ── Rollups: leaf-level targets aggregated up a chain ──────────────────────
-- p_chain = 'product' (sku→brand→subcategory→category→total) or
--           'geo'     (customer→route→area→region→company).
create or replace function erp_cp_targets_rollup(p_period date, p_metric text, p_chain text)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_period date := date_trunc('month', p_period)::date; v jsonb;
  v_all boolean := erp_fe_sees_all(); v_team uuid[] := array(select erp_fe_team());
begin
  if v_company is null then return null; end if;
  if p_chain = 'product' then
    -- leaf = sku targets (dim_id = product code); map via catalog to brand/subcat/cat
    with t as (select t.target_amount amt, p.code sku, p.name product_name, p.brand,
        p.category_id subcat_id, sc.name subcat_name, coalesce(sc.parent_id, p.category_id) cat_id, coalesce(pc.name, sc.name) cat_name
      from erp_cp_targets t join erp_products_catalog p on p.code = t.dim_id
      left join erp_product_categories sc on sc.id = p.category_id left join erp_product_categories pc on pc.id = sc.parent_id
      where t.company_id=v_company and t.period_month=v_period and t.metric=p_metric and t.dim_type='sku' and t.status<>'archived' and v_all)
    select jsonb_build_object('chain','product','total', coalesce((select sum(amt) from t),0),
      'by_sku', coalesce((select jsonb_agg(j) from (select jsonb_build_object('key',sku,'label',max(product_name),'target',sum(amt)) j from t group by sku) z),'[]'::jsonb),
      'by_brand', coalesce((select jsonb_agg(j) from (select jsonb_build_object('key',brand,'target',sum(amt)) j from t group by brand) z),'[]'::jsonb),
      'by_subcategory', coalesce((select jsonb_agg(j) from (select jsonb_build_object('key',subcat_id,'label',max(subcat_name),'target',sum(amt)) j from t group by subcat_id) z),'[]'::jsonb),
      'by_category', coalesce((select jsonb_agg(j) from (select jsonb_build_object('key',cat_id,'label',max(cat_name),'target',sum(amt)) j from t group by cat_id) z),'[]'::jsonb)) into v;
  else
    -- leaf = customer targets; map via customer→route/branch→area/region
    with t as (select t.target_amount amt, cu.id cust_id, cu.name cust_name, cu.route_id, rt.name route_name, b.area, b.region
      from erp_cp_targets t join erp_customers cu on cu.id = nullif(t.dim_id,'')::uuid
      left join erp_routes rt on rt.id = cu.route_id left join erp_branches b on b.id = cu.branch_id
      where t.company_id=v_company and t.period_month=v_period and t.metric=p_metric and t.dim_type='customer' and t.status<>'archived'
        and (v_all or cu.salesman_id = any(v_team)))
    select jsonb_build_object('chain','geo','total', coalesce((select sum(amt) from t),0),
      'by_customer', coalesce((select jsonb_agg(j) from (select jsonb_build_object('key',cust_id,'label',max(cust_name),'target',sum(amt)) j from t group by cust_id) z),'[]'::jsonb),
      'by_route', coalesce((select jsonb_agg(j) from (select jsonb_build_object('key',route_id,'label',max(route_name),'target',sum(amt)) j from t where route_id is not null group by route_id) z),'[]'::jsonb),
      'by_area', coalesce((select jsonb_agg(j) from (select jsonb_build_object('key',area,'target',sum(amt)) j from t where area is not null group by area) z),'[]'::jsonb),
      'by_region', coalesce((select jsonb_agg(j) from (select jsonb_build_object('key',region,'target',sum(amt)) j from t where region is not null group by region) z),'[]'::jsonb)) into v;
  end if;
  return v;
end; $$;
revoke all on function erp_cp_targets_rollup(date,text,text) from public, anon; grant execute on function erp_cp_targets_rollup(date,text,text) to authenticated;

-- ============================================================================
-- ROLLBACK (manual): drop erp_cp_targets_rollup / _list / _import / _validate /
-- _set_status / _save / erp_cp_dim_label / erp_cp_target_in_scope; drop table
-- erp_cp_targets.
-- ============================================================================
