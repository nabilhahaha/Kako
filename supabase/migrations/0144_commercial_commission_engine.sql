-- ============================================================================
-- 0144: Commercial Performance Pack (CP-4) — Commission Engine
-- ----------------------------------------------------------------------------
-- Configurable per-company commission plans (fixed amount, percentage, or
-- achievement-tier bands) on any commission dimension, driven by value- OR
-- quantity-based achievement, with qualification gates (min achievement / min
-- coverage / min execution score). Every computed payout is fully auditable
-- (target, actual, achievement %, rule applied, payout) in a ledger, and
-- results FREEZE per period after approval (a frozen run will not recompute).
-- Reads are scope-aware (Effective = User Scope AND Selected Filters).
-- ============================================================================

create table if not exists erp_cp_commission_plans (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references erp_companies(id) on delete cascade,
  name        text not null,
  dim_type    text not null check (dim_type in ('company','region','area','branch','route','rep','category','subcategory','brand','sku')),
  basis       text not null default 'value' check (basis in ('value','quantity')),      -- achievement basis
  payout_type text not null check (payout_type in ('fixed','percentage','tier')),
  rate_pct    numeric,                       -- percentage type: % of actual value
  fixed_amount numeric,                      -- fixed type: flat payout when qualified
  min_achievement_pct numeric not null default 0,
  min_coverage_pct    numeric,               -- rep-dim qualification (nullable = ignore)
  min_execution_score numeric,               -- rep-dim qualification (nullable = ignore)
  status      text not null default 'draft' check (status in ('draft','active','archived')),
  created_by  uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists erp_cp_commission_tiers (
  id        uuid primary key default gen_random_uuid(),
  plan_id   uuid not null references erp_cp_commission_plans(id) on delete cascade,
  company_id uuid not null references erp_companies(id) on delete cascade,
  from_pct  numeric not null,                -- band start (achievement %)
  to_pct    numeric,                         -- band end (exclusive); null = +∞
  rate_pct  numeric,                         -- % of actual value for this band
  fixed_amount numeric,                      -- or a flat amount for this band
  created_at timestamptz not null default now()
);
create table if not exists erp_cp_commission_payouts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references erp_companies(id) on delete cascade,
  plan_id     uuid not null references erp_cp_commission_plans(id) on delete cascade,
  period_month date not null,
  dim_type    text not null, dim_id text,
  basis       text not null,
  target      numeric, actual numeric, achievement_pct numeric,        -- audit
  coverage_pct numeric, execution_score numeric, qualified boolean not null default false,
  rule_applied jsonb not null default '{}'::jsonb,                       -- audit: which rule/tier fired
  payout      numeric not null default 0,                               -- audit: calculated payout
  status      text not null default 'draft' check (status in ('draft','approved')),
  frozen      boolean not null default false,
  approved_by uuid, approved_at timestamptz, run_at timestamptz not null default now(),
  created_at  timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists uq_cp_payouts on erp_cp_commission_payouts(company_id, plan_id, period_month, dim_type, (coalesce(dim_id,'')));
create index if not exists idx_cp_payouts_lookup on erp_cp_commission_payouts(company_id, plan_id, period_month, status);

alter table erp_cp_commission_plans enable row level security;
alter table erp_cp_commission_tiers enable row level security;
alter table erp_cp_commission_payouts enable row level security;
-- plans + tiers: read company-wide, write admin
drop policy if exists erp_cp_plans_read on erp_cp_commission_plans;
create policy erp_cp_plans_read on erp_cp_commission_plans for select using ((select erp_is_platform_owner()) or company_id = (select erp_user_company_id()));
drop policy if exists erp_cp_plans_write on erp_cp_commission_plans;
create policy erp_cp_plans_write on erp_cp_commission_plans for all using ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))) with check ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id)));
drop policy if exists erp_cp_tiers_read on erp_cp_commission_tiers;
create policy erp_cp_tiers_read on erp_cp_commission_tiers for select using ((select erp_is_platform_owner()) or company_id = (select erp_user_company_id()));
drop policy if exists erp_cp_tiers_write on erp_cp_commission_tiers;
create policy erp_cp_tiers_write on erp_cp_commission_tiers for all using ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))) with check ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id)));
-- payouts: scope-aware read (rep/route in team, broad → admin); write admin only (runs are RPCs)
drop policy if exists erp_cp_payouts_read on erp_cp_commission_payouts;
create policy erp_cp_payouts_read on erp_cp_commission_payouts for select using (
  (select erp_is_platform_owner()) or (company_id = (select erp_user_company_id()) and ((select erp_fe_sees_all())
    or (dim_type='rep' and dim_id = (select auth.uid())::text))));
drop policy if exists erp_cp_payouts_write on erp_cp_commission_payouts;
create policy erp_cp_payouts_write on erp_cp_commission_payouts for all using ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))) with check ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id)));

drop trigger if exists trg_audit_erp_cp_commission_plans on erp_cp_commission_plans;
create trigger trg_audit_erp_cp_commission_plans after insert or update or delete on erp_cp_commission_plans for each row execute function erp_audit_capture();
drop trigger if exists trg_audit_erp_cp_commission_payouts on erp_cp_commission_payouts;
create trigger trg_audit_erp_cp_commission_payouts after insert or update or delete on erp_cp_commission_payouts for each row execute function erp_audit_capture();
drop trigger if exists erp_cp_plans_updated on erp_cp_commission_plans;
create trigger erp_cp_plans_updated before update on erp_cp_commission_plans for each row execute function erp_set_updated_at();
drop trigger if exists erp_cp_payouts_updated on erp_cp_commission_payouts;
create trigger erp_cp_payouts_updated before update on erp_cp_commission_payouts for each row execute function erp_set_updated_at();

-- ── Plan + tier authoring (admin via RLS) ──────────────────────────────────
create or replace function erp_cp_commission_plan_save(
  p_name text, p_dim_type text, p_basis text, p_payout_type text,
  p_rate_pct numeric default null, p_fixed_amount numeric default null,
  p_min_achievement numeric default 0, p_min_coverage numeric default null, p_min_execution numeric default null,
  p_status text default 'draft', p_id uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_id uuid := p_id;
begin
  if v_company is null or not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  if p_id is null then
    insert into erp_cp_commission_plans (company_id, name, dim_type, basis, payout_type, rate_pct, fixed_amount, min_achievement_pct, min_coverage_pct, min_execution_score, status, created_by)
      values (v_company, p_name, p_dim_type, coalesce(p_basis,'value'), p_payout_type, p_rate_pct, p_fixed_amount, coalesce(p_min_achievement,0), p_min_coverage, p_min_execution, coalesce(p_status,'draft'), (select auth.uid()))
      returning id into v_id;
  else
    update erp_cp_commission_plans set name=p_name, dim_type=p_dim_type, basis=coalesce(p_basis,'value'), payout_type=p_payout_type,
      rate_pct=p_rate_pct, fixed_amount=p_fixed_amount, min_achievement_pct=coalesce(p_min_achievement,0), min_coverage_pct=p_min_coverage,
      min_execution_score=p_min_execution, status=coalesce(p_status,status), updated_at=now()
      where id=p_id and company_id=v_company;
  end if;
  return jsonb_build_object('id', v_id);
end; $$;
revoke all on function erp_cp_commission_plan_save(text,text,text,text,numeric,numeric,numeric,numeric,numeric,text,uuid) from public, anon;
grant execute on function erp_cp_commission_plan_save(text,text,text,text,numeric,numeric,numeric,numeric,numeric,text,uuid) to authenticated;

create or replace function erp_cp_commission_tier_add(p_plan uuid, p_from numeric, p_to numeric, p_rate_pct numeric default null, p_fixed numeric default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_id uuid;
begin
  if v_company is null or not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  if not exists(select 1 from erp_cp_commission_plans where id=p_plan and company_id=v_company) then raise exception 'not found'; end if;
  insert into erp_cp_commission_tiers (plan_id, company_id, from_pct, to_pct, rate_pct, fixed_amount)
    values (p_plan, v_company, p_from, p_to, p_rate_pct, p_fixed) returning id into v_id;
  return jsonb_build_object('id', v_id);
end; $$;
revoke all on function erp_cp_commission_tier_add(uuid,numeric,numeric,numeric,numeric) from public, anon;
grant execute on function erp_cp_commission_tier_add(uuid,numeric,numeric,numeric,numeric) to authenticated;

-- ── Run a plan for a period: compute auditable payouts (idempotent on drafts;
--    refuses if the period is frozen) ────────────────────────────────────────
create or replace function erp_cp_commission_run(p_plan uuid, p_month date)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); pl erp_cp_commission_plans; cur_from date := date_trunc('month', p_month)::date; cur_to date;
  perf jsonb; row jsonb; blk jsonb; v_actual numeric; v_target numeric; v_ach numeric; v_val_actual numeric; v_key text;
  v_cov numeric; v_exec numeric; v_qual boolean; v_payout numeric; v_rule jsonb; tier erp_cp_commission_tiers;
  n int := 0; n_qual int := 0; total numeric := 0;
begin
  if v_company is null or not erp_fe_sees_all() then raise exception 'forbidden'; end if;     -- company-wide compute: admin/owner
  select * into pl from erp_cp_commission_plans where id=p_plan and company_id=v_company;
  if not found then raise exception 'not found'; end if;
  cur_to := (cur_from + interval '1 month - 1 day')::date;
  if exists(select 1 from erp_cp_commission_payouts where plan_id=p_plan and period_month=cur_from and frozen) then raise exception 'period frozen'; end if;
  delete from erp_cp_commission_payouts where plan_id=p_plan and period_month=cur_from and not frozen;

  perf := erp_cp_performance(cur_from, pl.dim_type);            -- source-aware, all keys (admin)
  for row in select * from jsonb_array_elements(perf) loop
    v_key := row->>'key'; blk := row->(pl.basis);
    v_actual := (blk->>'actual')::numeric; v_target := (blk->>'target')::numeric; v_ach := (blk->>'achievement')::numeric;
    v_val_actual := (row->'value'->>'actual')::numeric;          -- payout base = monetary value
    v_cov := null; v_exec := null;
    if pl.dim_type='rep' then
      select coalesce(round(100.0*count(*) filter (where st.status='visited')/nullif(count(*),0)),0) into v_cov
        from erp_fe_route_stops st join erp_fe_route_plans p on p.id=st.plan_id
        where st.company_id=v_company and st.due and p.rep_id=v_key::uuid and p.plan_date between cur_from and cur_to;
      v_exec := (erp_fe_execution_scores('rep', v_key::uuid, cur_from::timestamptz, (cur_to+1)::timestamptz)->>'overall')::numeric;
    end if;
    v_qual := coalesce(v_ach,0) >= pl.min_achievement_pct
      and (pl.dim_type<>'rep' or pl.min_coverage_pct is null or coalesce(v_cov,0) >= pl.min_coverage_pct)
      and (pl.dim_type<>'rep' or pl.min_execution_score is null or coalesce(v_exec,0) >= pl.min_execution_score);
    v_payout := 0; v_rule := jsonb_build_object('qualified', v_qual, 'payout_type', pl.payout_type);
    if v_qual then
      if pl.payout_type='fixed' then v_payout := coalesce(pl.fixed_amount,0); v_rule := v_rule || jsonb_build_object('fixed_amount', pl.fixed_amount);
      elsif pl.payout_type='percentage' then v_payout := round(coalesce(pl.rate_pct,0)/100 * coalesce(v_val_actual,0), 2); v_rule := v_rule || jsonb_build_object('rate_pct', pl.rate_pct);
      else  -- tier: band where achievement falls
        select * into tier from erp_cp_commission_tiers where plan_id=p_plan and coalesce(v_ach,0) >= from_pct and (to_pct is null or coalesce(v_ach,0) < to_pct) order by from_pct desc limit 1;
        if found then
          if tier.fixed_amount is not null then v_payout := tier.fixed_amount; else v_payout := round(coalesce(tier.rate_pct,0)/100 * coalesce(v_val_actual,0), 2); end if;
          v_rule := v_rule || jsonb_build_object('tier_from', tier.from_pct, 'tier_to', tier.to_pct, 'rate_pct', tier.rate_pct, 'fixed_amount', tier.fixed_amount);
        else v_rule := v_rule || jsonb_build_object('tier', 'none'); end if;
      end if;
    end if;
    insert into erp_cp_commission_payouts (company_id, plan_id, period_month, dim_type, dim_id, basis, target, actual, achievement_pct, coverage_pct, execution_score, qualified, rule_applied, payout)
      values (v_company, p_plan, cur_from, pl.dim_type, nullif(v_key,'all'), pl.basis, v_target, v_actual, v_ach, v_cov, v_exec, v_qual, v_rule, v_payout);
    n := n + 1; if v_qual then n_qual := n_qual + 1; total := total + v_payout; end if;
  end loop;
  return jsonb_build_object('computed', n, 'qualified', n_qual, 'total_payout', round(total,2), 'period', cur_from);
end; $$;
revoke all on function erp_cp_commission_run(uuid, date) from public, anon; grant execute on function erp_cp_commission_run(uuid, date) to authenticated;

-- ── Approve + freeze a period's payouts (no further recompute) ─────────────
create or replace function erp_cp_commission_approve(p_plan uuid, p_month date)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); cur_from date := date_trunc('month', p_month)::date; n int;
begin
  if v_company is null or not erp_fe_sees_all() then raise exception 'forbidden'; end if;
  if not exists(select 1 from erp_cp_commission_plans where id=p_plan and company_id=v_company) then raise exception 'not found'; end if;
  update erp_cp_commission_payouts set status='approved', frozen=true, approved_by=(select auth.uid()), approved_at=now(), updated_at=now()
    where plan_id=p_plan and period_month=cur_from and company_id=v_company and not frozen;
  get diagnostics n = row_count;
  return jsonb_build_object('approved', n, 'frozen', true);
end; $$;
revoke all on function erp_cp_commission_approve(uuid, date) from public, anon; grant execute on function erp_cp_commission_approve(uuid, date) to authenticated;

-- ── Scoped payout ledger (audit view) ──────────────────────────────────────
create or replace function erp_cp_commission_payouts_list(p_month date default null, p_plan uuid default null, p_status text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v jsonb; v_all boolean := erp_fe_sees_all(); v_team uuid[] := array(select erp_fe_team());
  v_month date := case when p_month is null then null else date_trunc('month', p_month)::date end;
begin
  if v_company is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', po.id, 'plan_id', po.plan_id, 'plan', pl.name, 'period_month', po.period_month,
      'dim_type', po.dim_type, 'dim_id', po.dim_id, 'label', erp_cp_dim_label(po.dim_type, po.dim_id), 'basis', po.basis,
      'target', po.target, 'actual', po.actual, 'achievement_pct', po.achievement_pct, 'coverage_pct', po.coverage_pct,
      'execution_score', po.execution_score, 'qualified', po.qualified, 'rule_applied', po.rule_applied, 'payout', po.payout,
      'status', po.status, 'frozen', po.frozen, 'approved_at', po.approved_at) order by po.payout desc), '[]'::jsonb) into v
  from erp_cp_commission_payouts po join erp_cp_commission_plans pl on pl.id = po.plan_id
  where po.company_id = v_company
    and (v_all or (po.dim_type='rep' and po.dim_id = any(v_team::text[]))
      or (po.dim_type='route' and (select rep_id from erp_routes where id=nullif(po.dim_id,'')::uuid) = any(v_team)))
    and (v_month is null or po.period_month = v_month) and (p_plan is null or po.plan_id = p_plan) and (p_status is null or po.status = p_status);
  return v;
end; $$;
revoke all on function erp_cp_commission_payouts_list(date,uuid,text) from public, anon; grant execute on function erp_cp_commission_payouts_list(date,uuid,text) to authenticated;

-- ============================================================================
-- ROLLBACK (manual): drop erp_cp_commission_payouts_list / _approve / _run /
-- _tier_add / _plan_save; drop tables erp_cp_commission_payouts, _tiers, _plans.
-- ============================================================================
