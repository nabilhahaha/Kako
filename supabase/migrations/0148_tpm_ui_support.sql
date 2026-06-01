-- ============================================================================
-- 0148: Trade Promotion Management (TPM-2) — UI support
-- ----------------------------------------------------------------------------
-- Adds the 'paused' lifecycle state (Pause/Resume), a promotion sales target
-- (for Achievement vs Promotion Target), a scope-aware dashboard summary, a
-- single-promotion getter with live actuals, and target removal.
-- ============================================================================

alter table erp_tpm_promotions add column if not exists target_value numeric;   -- promotion sales goal (value)
alter table erp_tpm_promotions add column if not exists target_qty   numeric;   -- promotion sales goal (qty)
-- extend the lifecycle with 'paused'
alter table erp_tpm_promotions drop constraint if exists erp_tpm_promotions_status_check;
alter table erp_tpm_promotions add constraint erp_tpm_promotions_status_check
  check (status in ('draft','approved','active','paused','expired','archived'));

-- save: accept target_value / target_qty (appended; existing calls unaffected)
drop function if exists erp_tpm_promotion_save(text,text,date,date,numeric,numeric,jsonb,text,uuid);
create or replace function erp_tpm_promotion_save(
  p_name text, p_type text, p_starts date, p_ends date, p_budget numeric default null, p_cost numeric default null,
  p_params jsonb default '{}'::jsonb, p_notes text default null, p_id uuid default null,
  p_target_value numeric default null, p_target_qty numeric default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_id uuid := p_id;
begin
  if v_company is null or not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  if p_id is null then
    insert into erp_tpm_promotions (company_id, name, promo_type, params, starts_on, ends_on, budget, cost, target_value, target_qty, notes, created_by)
      values (v_company, p_name, p_type, coalesce(p_params,'{}'::jsonb), p_starts, p_ends, p_budget, p_cost, p_target_value, p_target_qty, p_notes, (select auth.uid())) returning id into v_id;
  else
    update erp_tpm_promotions set name=p_name, promo_type=p_type, params=coalesce(p_params,'{}'::jsonb), starts_on=p_starts, ends_on=p_ends,
      budget=p_budget, cost=p_cost, target_value=p_target_value, target_qty=p_target_qty, notes=p_notes, updated_at=now()
      where id=p_id and company_id=v_company and status='draft';
  end if;
  return jsonb_build_object('id', v_id);
end; $$;
revoke all on function erp_tpm_promotion_save(text,text,date,date,numeric,numeric,jsonb,text,uuid,numeric,numeric) from public, anon;
grant execute on function erp_tpm_promotion_save(text,text,date,date,numeric,numeric,jsonb,text,uuid,numeric,numeric) to authenticated;

-- set_status now allows 'paused'
create or replace function erp_tpm_set_status(p_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id();
begin
  if v_company is null or not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  if p_status not in ('draft','approved','active','paused','expired','archived') then raise exception 'bad status'; end if;
  update erp_tpm_promotions set status=p_status,
    approved_by = case when p_status='approved' then (select auth.uid()) else approved_by end,
    approved_at = case when p_status='approved' then now() else approved_at end, updated_at=now()
    where id=p_id and company_id=v_company;
  if not found then raise exception 'not found'; end if;
  return jsonb_build_object('ok', true, 'status', p_status);
end; $$;
revoke all on function erp_tpm_set_status(uuid, text) from public, anon; grant execute on function erp_tpm_set_status(uuid, text) to authenticated;

-- actuals: add promotion target + achievement
create or replace function erp_tpm_promotion_actuals(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); pr erp_tpm_promotions; v_src text; v jsonb; av numeric; aq numeric; v_cust int; v_docs int;
  geo text[] := array['region','area','branch','route','rep','customer','channel','classification','company']; prod text[] := array['category','subcategory','brand','sku'];
begin
  if v_company is null then return null; end if;
  select * into pr from erp_tpm_promotions where id=p_id and company_id=v_company; if not found then return null; end if;
  v_src := erp_cp_primary_source(v_company);
  select round(coalesce(sum(s.value),0),2), coalesce(sum(s.qty),0), count(distinct s.customer_id), count(distinct s.doc_id) into av, aq, v_cust, v_docs
  from erp_cp_sales_facts s
  where s.company_id=v_company and s.source=v_src and s.fact_date between pr.starts_on and pr.ends_on
    and (not exists(select 1 from erp_tpm_promotion_targets t where t.promotion_id=p_id and t.dim_type = any(geo))
      or exists(select 1 from erp_tpm_promotion_targets t where t.promotion_id=p_id and (
        (t.dim_type='region' and t.dim_id=s.region) or (t.dim_type='area' and t.dim_id=s.area)
        or (t.dim_type='branch' and t.dim_id=s.branch_id::text) or (t.dim_type='route' and t.dim_id=s.route_id::text)
        or (t.dim_type='rep' and t.dim_id=s.rep_id::text) or (t.dim_type='customer' and t.dim_id=s.customer_id::text)
        or (t.dim_type='channel' and t.dim_id=s.channel) or (t.dim_type='classification' and t.dim_id=s.classification)
        or (t.dim_type='company'))))
    and (not exists(select 1 from erp_tpm_promotion_targets t where t.promotion_id=p_id and t.dim_type = any(prod))
      or exists(select 1 from erp_tpm_promotion_targets t where t.promotion_id=p_id and (
        (t.dim_type='category' and t.dim_id=s.category_id::text) or (t.dim_type='subcategory' and t.dim_id=s.subcategory_id::text)
        or (t.dim_type='brand' and t.dim_id=s.brand) or (t.dim_type='sku' and t.dim_id=s.sku))));
  v := jsonb_build_object('actual_value', av, 'actual_qty', aq, 'customers', v_cust, 'docs', v_docs, 'budget', pr.budget, 'cost', pr.cost,
    'target_value', pr.target_value, 'target_qty', pr.target_qty,
    'achievement_value', case when coalesce(pr.target_value,0)>0 then round(100*av/pr.target_value) end,
    'achievement_qty', case when coalesce(pr.target_qty,0)>0 then round(100*aq/pr.target_qty) end,
    'period', jsonb_build_object('from', pr.starts_on, 'to', pr.ends_on));
  return v;
end; $$;
revoke all on function erp_tpm_promotion_actuals(uuid) from public, anon; grant execute on function erp_tpm_promotion_actuals(uuid) to authenticated;

-- remove a target (admin)
create or replace function erp_tpm_target_remove(p_promo uuid, p_dim_type text, p_dim_id text default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id();
begin
  if v_company is null or not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  delete from erp_tpm_promotion_targets where promotion_id=p_promo and company_id=v_company and dim_type=p_dim_type and coalesce(dim_id,'')=coalesce(nullif(p_dim_id,''),'');
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function erp_tpm_target_remove(uuid,text,text) from public, anon; grant execute on function erp_tpm_target_remove(uuid,text,text) to authenticated;

-- scope-aware single-promotion getter (detail + live actuals)
create or replace function erp_tpm_promotion_get(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_all boolean := erp_fe_sees_all(); v_team uuid[] := array(select erp_fe_team()); v jsonb;
begin
  if v_company is null then return null; end if;
  if not exists (select 1 from erp_tpm_promotions p where p.id=p_id and p.company_id=v_company and (v_all
      or not exists(select 1 from erp_tpm_promotion_targets t where t.promotion_id=p.id and t.dim_type in ('rep','route','customer'))
      or exists(select 1 from erp_tpm_promotion_targets t where t.promotion_id=p.id and (
        (t.dim_type='rep' and t.dim_id = any(v_team::text[]))
        or (t.dim_type='route' and (select rep_id from erp_routes where id=nullif(t.dim_id,'')::uuid) = any(v_team))
        or (t.dim_type='customer' and (select salesman_id from erp_customers where id=nullif(t.dim_id,'')::uuid) = any(v_team)))))) then return null; end if;
  select jsonb_build_object('id', p.id, 'name', p.name, 'promo_type', p.promo_type, 'params', p.params, 'starts_on', p.starts_on, 'ends_on', p.ends_on,
    'budget', p.budget, 'cost', p.cost, 'target_value', p.target_value, 'target_qty', p.target_qty, 'status', p.status, 'notes', p.notes,
    'targets', (select coalesce(jsonb_agg(jsonb_build_object('dim_type', t.dim_type, 'dim_id', t.dim_id, 'label', erp_cp_dim_label(t.dim_type, t.dim_id))), '[]'::jsonb) from erp_tpm_promotion_targets t where t.promotion_id=p.id),
    'actuals', erp_tpm_promotion_actuals(p.id)) into v from erp_tpm_promotions p where p.id=p_id;
  return v;
end; $$;
revoke all on function erp_tpm_promotion_get(uuid) from public, anon; grant execute on function erp_tpm_promotion_get(uuid) to authenticated;

-- scope-aware dashboard summary (counts + budget/cost/actual sums)
create or replace function erp_tpm_summary()
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_all boolean := erp_fe_sees_all(); v_team uuid[] := array(select erp_fe_team()); v jsonb;
begin
  if v_company is null then return null; end if;
  with p as (
    select pr.*, (select pf.actual_value from erp_tpm_promotion_performance pf where pf.promotion_id=pr.id) actual_value
    from erp_tpm_promotions pr where pr.company_id=v_company and (v_all
      or not exists(select 1 from erp_tpm_promotion_targets t where t.promotion_id=pr.id and t.dim_type in ('rep','route','customer'))
      or exists(select 1 from erp_tpm_promotion_targets t where t.promotion_id=pr.id and (
        (t.dim_type='rep' and t.dim_id = any(v_team::text[]))
        or (t.dim_type='route' and (select rep_id from erp_routes where id=nullif(t.dim_id,'')::uuid) = any(v_team))
        or (t.dim_type='customer' and (select salesman_id from erp_customers where id=nullif(t.dim_id,'')::uuid) = any(v_team))))))
  select jsonb_build_object(
    'active', count(*) filter (where status='active'),
    'upcoming', count(*) filter (where starts_on > current_date and status not in ('archived','expired')),
    'expired', count(*) filter (where status='expired' or (ends_on < current_date and status not in ('archived','draft'))),
    'budget', coalesce(sum(budget) filter (where status not in ('archived','draft')),0),
    'cost', coalesce(sum(cost) filter (where status not in ('archived','draft')),0),
    'actual_sales', coalesce(sum(actual_value),0)) into v from p;
  return v;
end; $$;
revoke all on function erp_tpm_summary() from public, anon; grant execute on function erp_tpm_summary() to authenticated;

-- ============================================================================
-- ROLLBACK (manual): restore 0147 save/set_status/actuals; drop _summary,
-- _promotion_get, _target_remove; drop target_value/target_qty; restore the
-- 0147 status check (without 'paused').
-- ============================================================================
