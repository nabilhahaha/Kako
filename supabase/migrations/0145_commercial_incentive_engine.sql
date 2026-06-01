-- ============================================================================
-- 0145: Commercial Performance Pack (CP-5) — Incentive Engine
-- ----------------------------------------------------------------------------
-- Incentives are kept SEPARATE from commissions (own tables) but use the same
-- audit + freeze discipline, so combined payout reporting is trivial later
-- (erp_cp_payout_statement unions both). Programs are VERSIONED and move through
-- an approval WORKFLOW (draft→submitted→approved→active→archived). Each program
-- has an incentive type, a multi-condition rule (ANDed), and a fixed or variable
-- payout. Runs produce auditable payout rows that FREEZE per period after
-- approval. Reads are scope-aware (Effective = User Scope AND Selected Filters).
-- ============================================================================

create table if not exists erp_cp_incentive_programs (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references erp_companies(id) on delete cascade,
  lineage_id  uuid,                              -- stable id across versions (root program)
  version     integer not null default 1,
  supersedes  uuid references erp_cp_incentive_programs(id) on delete set null,
  is_latest   boolean not null default true,
  name        text not null,
  incentive_type text not null check (incentive_type in ('new_customer','category_achievement','brand_achievement','sku_achievement','distribution','visibility','collection','special_campaign')),
  dim_type    text not null default 'rep' check (dim_type in ('company','region','area','branch','route','rep','category','subcategory','brand','sku')),
  basis       text not null default 'value' check (basis in ('value','quantity')),
  payout_mode text not null check (payout_mode in ('fixed','variable')),
  fixed_amount numeric,                          -- fixed mode
  rate_pct    numeric,                           -- variable: % of value actual
  per_unit_amount numeric,                       -- variable: × unit count (new customers / active SKUs)
  conditions  jsonb not null default '[]'::jsonb,-- [{metric, op, value}] ANDed
  status      text not null default 'draft' check (status in ('draft','submitted','approved','active','archived')),
  created_by  uuid, submitted_by uuid, submitted_at timestamptz, approved_by uuid, approved_at timestamptz,
  created_at  timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists erp_cp_incentive_payouts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references erp_companies(id) on delete cascade,
  program_id  uuid not null references erp_cp_incentive_programs(id) on delete cascade,
  incentive_type text not null, period_month date not null,
  dim_type    text not null, dim_id text,
  metrics     jsonb not null default '{}'::jsonb,   -- audit: computed metric bag
  conditions_met boolean not null default false,
  rule_applied jsonb not null default '{}'::jsonb,  -- audit: which conditions / formula
  payout      numeric not null default 0,
  status      text not null default 'draft' check (status in ('draft','approved')),
  frozen      boolean not null default false,
  approved_by uuid, approved_at timestamptz, run_at timestamptz not null default now(),
  created_at  timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists uq_cp_incentive_payouts on erp_cp_incentive_payouts(company_id, program_id, period_month, dim_type, (coalesce(dim_id,'')));
create index if not exists idx_cp_incentive_payouts_lookup on erp_cp_incentive_payouts(company_id, program_id, period_month, status);

alter table erp_cp_incentive_programs enable row level security;
alter table erp_cp_incentive_payouts enable row level security;
drop policy if exists erp_cp_inc_prog_read on erp_cp_incentive_programs;
create policy erp_cp_inc_prog_read on erp_cp_incentive_programs for select using ((select erp_is_platform_owner()) or company_id = (select erp_user_company_id()));
drop policy if exists erp_cp_inc_prog_write on erp_cp_incentive_programs;
create policy erp_cp_inc_prog_write on erp_cp_incentive_programs for all using ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))) with check ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id)));
drop policy if exists erp_cp_inc_pay_read on erp_cp_incentive_payouts;
create policy erp_cp_inc_pay_read on erp_cp_incentive_payouts for select using (
  (select erp_is_platform_owner()) or (company_id = (select erp_user_company_id()) and ((select erp_fe_sees_all()) or (dim_type='rep' and dim_id = (select auth.uid())::text))));
drop policy if exists erp_cp_inc_pay_write on erp_cp_incentive_payouts;
create policy erp_cp_inc_pay_write on erp_cp_incentive_payouts for all using ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))) with check ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id)));
drop trigger if exists trg_audit_erp_cp_incentive_programs on erp_cp_incentive_programs;
create trigger trg_audit_erp_cp_incentive_programs after insert or update or delete on erp_cp_incentive_programs for each row execute function erp_audit_capture();
drop trigger if exists trg_audit_erp_cp_incentive_payouts on erp_cp_incentive_payouts;
create trigger trg_audit_erp_cp_incentive_payouts after insert or update or delete on erp_cp_incentive_payouts for each row execute function erp_audit_capture();
drop trigger if exists erp_cp_inc_prog_updated on erp_cp_incentive_programs;
create trigger erp_cp_inc_prog_updated before update on erp_cp_incentive_programs for each row execute function erp_set_updated_at();
drop trigger if exists erp_cp_inc_pay_updated on erp_cp_incentive_payouts;
create trigger erp_cp_inc_pay_updated before update on erp_cp_incentive_payouts for each row execute function erp_set_updated_at();

-- ── Program authoring + versioning + approval workflow (admin) ──────────────
create or replace function erp_cp_incentive_program_save(
  p_name text, p_type text, p_dim_type text, p_basis text, p_payout_mode text,
  p_fixed numeric default null, p_rate_pct numeric default null, p_per_unit numeric default null,
  p_conditions jsonb default '[]'::jsonb, p_id uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_id uuid := p_id;
begin
  if v_company is null or not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  if p_id is null then
    insert into erp_cp_incentive_programs (company_id, name, incentive_type, dim_type, basis, payout_mode, fixed_amount, rate_pct, per_unit_amount, conditions, created_by)
      values (v_company, p_name, p_type, coalesce(p_dim_type,'rep'), coalesce(p_basis,'value'), p_payout_mode, p_fixed, p_rate_pct, p_per_unit, coalesce(p_conditions,'[]'::jsonb), (select auth.uid()))
      returning id into v_id;
    update erp_cp_incentive_programs set lineage_id = v_id where id = v_id;     -- root lineage = self
  else
    update erp_cp_incentive_programs set name=p_name, incentive_type=p_type, dim_type=coalesce(p_dim_type,'rep'), basis=coalesce(p_basis,'value'),
      payout_mode=p_payout_mode, fixed_amount=p_fixed, rate_pct=p_rate_pct, per_unit_amount=p_per_unit, conditions=coalesce(p_conditions,'[]'::jsonb), updated_at=now()
      where id=p_id and company_id=v_company and status='draft';   -- only drafts are editable
  end if;
  return jsonb_build_object('id', v_id);
end; $$;
revoke all on function erp_cp_incentive_program_save(text,text,text,text,text,numeric,numeric,numeric,jsonb,uuid) from public, anon;
grant execute on function erp_cp_incentive_program_save(text,text,text,text,text,numeric,numeric,numeric,jsonb,uuid) to authenticated;

-- new draft version of an existing program (carries lineage)
create or replace function erp_cp_incentive_new_version(p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); o erp_cp_incentive_programs; v_id uuid;
begin
  if v_company is null or not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  select * into o from erp_cp_incentive_programs where id=p_id and company_id=v_company;
  if not found then raise exception 'not found'; end if;
  insert into erp_cp_incentive_programs (company_id, lineage_id, version, supersedes, is_latest, name, incentive_type, dim_type, basis, payout_mode, fixed_amount, rate_pct, per_unit_amount, conditions, status, created_by)
    values (v_company, coalesce(o.lineage_id,o.id), o.version+1, o.id, false, o.name, o.incentive_type, o.dim_type, o.basis, o.payout_mode, o.fixed_amount, o.rate_pct, o.per_unit_amount, o.conditions, 'draft', (select auth.uid()))
    returning id into v_id;
  return jsonb_build_object('id', v_id, 'version', o.version+1);
end; $$;
revoke all on function erp_cp_incentive_new_version(uuid) from public, anon; grant execute on function erp_cp_incentive_new_version(uuid) to authenticated;

-- workflow transitions: draft→submitted→approved→active; →archived. Stamps actors.
create or replace function erp_cp_incentive_set_status(p_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); o erp_cp_incentive_programs; v_uid uuid := (select auth.uid());
begin
  if v_company is null or not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  if p_status not in ('draft','submitted','approved','active','archived') then raise exception 'bad status'; end if;
  select * into o from erp_cp_incentive_programs where id=p_id and company_id=v_company;
  if not found then raise exception 'not found'; end if;
  -- enforce the forward workflow (archive always allowed)
  if p_status='submitted' and o.status<>'draft' then raise exception 'must be draft'; end if;
  if p_status='approved' and o.status<>'submitted' then raise exception 'must be submitted'; end if;
  if p_status='active' and o.status<>'approved' then raise exception 'must be approved'; end if;
  update erp_cp_incentive_programs set status=p_status,
    submitted_by = case when p_status='submitted' then v_uid else submitted_by end, submitted_at = case when p_status='submitted' then now() else submitted_at end,
    approved_by  = case when p_status='approved' then v_uid else approved_by end,  approved_at  = case when p_status='approved' then now() else approved_at end,
    updated_at = now() where id=p_id;
  if p_status='active' then  -- only one active version per lineage
    update erp_cp_incentive_programs set is_latest=false where company_id=v_company and coalesce(lineage_id,id)=coalesce(o.lineage_id,o.id) and id<>p_id;
    update erp_cp_incentive_programs set is_latest=true where id=p_id;
  end if;
  return jsonb_build_object('ok', true, 'status', p_status);
end; $$;
revoke all on function erp_cp_incentive_set_status(uuid, text) from public, anon; grant execute on function erp_cp_incentive_set_status(uuid, text) to authenticated;

-- ── Multi-condition evaluator (all ANDed; unknown/absent metric → fail) ─────
create or replace function erp_cp_eval_conditions(p_conditions jsonb, p_metrics jsonb)
returns boolean language plpgsql immutable as $$
declare cond jsonb; m numeric; v numeric; op text;
begin
  for cond in select * from jsonb_array_elements(coalesce(p_conditions,'[]'::jsonb)) loop
    if not (p_metrics ? (cond->>'metric')) then return false; end if;
    m := (p_metrics->>(cond->>'metric'))::numeric; v := (cond->>'value')::numeric; op := cond->>'op';
    if m is null then return false; end if;
    if not (case op when '>=' then m>=v when '>' then m>v when '<=' then m<=v when '<' then m<v when '=' then m=v else false end) then return false; end if;
  end loop;
  return true;
end; $$;
revoke all on function erp_cp_eval_conditions(jsonb, jsonb) from public, anon; grant execute on function erp_cp_eval_conditions(jsonb, jsonb) to authenticated;

-- ── Run a program for a period (auditable; idempotent on drafts; freeze-safe) ─
create or replace function erp_cp_incentive_run(p_program uuid, p_month date)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); pr erp_cp_incentive_programs; cur_from date := date_trunc('month', p_month)::date; cur_to date;
  v_src text; rec record; v_actual_basis numeric; v_target numeric; v_ach numeric; v_cov numeric; v_exec numeric;
  v_newc numeric; v_metrics jsonb; v_ok boolean; v_payout numeric; v_unit numeric; n int := 0; n_ok int := 0; total numeric := 0;
begin
  if v_company is null or not erp_fe_sees_all() then raise exception 'forbidden'; end if;
  select * into pr from erp_cp_incentive_programs where id=p_program and company_id=v_company;
  if not found then raise exception 'not found'; end if;
  cur_to := (cur_from + interval '1 month - 1 day')::date; v_src := erp_cp_primary_source(v_company);
  if exists(select 1 from erp_cp_incentive_payouts where program_id=p_program and period_month=cur_from and frozen) then raise exception 'period frozen'; end if;
  delete from erp_cp_incentive_payouts where program_id=p_program and period_month=cur_from and not frozen;

  for rec in
    select case pr.dim_type when 'rep' then s.rep_id::text when 'route' then s.route_id::text when 'branch' then s.branch_id::text
        when 'area' then s.area when 'region' then s.region when 'category' then s.category_id::text when 'subcategory' then s.subcategory_id::text
        when 'brand' then s.brand when 'sku' then s.sku when 'customer' then s.customer_id::text else 'all' end as key,
      sum(s.value) val, sum(s.qty) qty, count(distinct s.product_id) skus
    from erp_cp_sales_facts s
    where s.company_id=v_company and s.source=v_src and s.fact_date between cur_from and cur_to
    group by 1
  loop
    if rec.key is null then continue; end if;
    v_actual_basis := case when pr.basis='quantity' then rec.qty else rec.val end;
    select max(target_amount) into v_target from erp_cp_targets where company_id=v_company and period_month=cur_from and dim_type=pr.dim_type and coalesce(dim_id,'')=rec.key and metric=pr.basis and status in ('approved','active');
    v_ach := case when coalesce(v_target,0)>0 then round(100*v_actual_basis/v_target) end;
    v_cov := null; v_exec := null; v_newc := null;
    if pr.dim_type='rep' then
      select coalesce(round(100.0*count(*) filter (where st.status='visited')/nullif(count(*),0)),0) into v_cov
        from erp_fe_route_stops st join erp_fe_route_plans p on p.id=st.plan_id where st.company_id=v_company and st.due and p.rep_id=rec.key::uuid and p.plan_date between cur_from and cur_to;
      v_exec := (erp_fe_execution_scores('rep', rec.key::uuid, cur_from::timestamptz, (cur_to+1)::timestamptz)->>'overall')::numeric;
      select count(*) into v_newc from (select customer_id, min(fact_date) m from erp_cp_sales_facts where company_id=v_company and source=v_src and rep_id=rec.key::uuid group by customer_id) q where q.m between cur_from and cur_to;
    end if;
    v_metrics := jsonb_strip_nulls(jsonb_build_object('achievement', v_ach, 'coverage', v_cov, 'execution', v_exec, 'new_customers', v_newc, 'active_skus', rec.skus));
    v_ok := erp_cp_eval_conditions(pr.conditions, v_metrics);
    v_payout := 0;
    if v_ok then
      if pr.payout_mode='fixed' then v_payout := coalesce(pr.fixed_amount,0);
      else
        v_unit := case pr.incentive_type when 'new_customer' then coalesce(v_newc,0) when 'distribution' then rec.skus else 0 end;
        v_payout := round(coalesce(pr.rate_pct,0)/100 * coalesce(rec.val,0) + coalesce(pr.per_unit_amount,0) * v_unit, 2);
      end if;
    end if;
    insert into erp_cp_incentive_payouts (company_id, program_id, incentive_type, period_month, dim_type, dim_id, metrics, conditions_met, rule_applied, payout)
      values (v_company, p_program, pr.incentive_type, cur_from, pr.dim_type, nullif(rec.key,'all'), v_metrics, v_ok,
        jsonb_build_object('payout_mode', pr.payout_mode, 'conditions', pr.conditions, 'rate_pct', pr.rate_pct, 'per_unit_amount', pr.per_unit_amount, 'fixed_amount', pr.fixed_amount), v_payout);
    n := n + 1; if v_ok then n_ok := n_ok + 1; total := total + v_payout; end if;
  end loop;
  return jsonb_build_object('computed', n, 'qualified', n_ok, 'total_payout', round(total,2), 'period', cur_from);
end; $$;
revoke all on function erp_cp_incentive_run(uuid, date) from public, anon; grant execute on function erp_cp_incentive_run(uuid, date) to authenticated;

create or replace function erp_cp_incentive_approve(p_program uuid, p_month date)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); cur_from date := date_trunc('month', p_month)::date; n int;
begin
  if v_company is null or not erp_fe_sees_all() then raise exception 'forbidden'; end if;
  if not exists(select 1 from erp_cp_incentive_programs where id=p_program and company_id=v_company) then raise exception 'not found'; end if;
  update erp_cp_incentive_payouts set status='approved', frozen=true, approved_by=(select auth.uid()), approved_at=now(), updated_at=now()
    where program_id=p_program and period_month=cur_from and company_id=v_company and not frozen;
  get diagnostics n = row_count;
  return jsonb_build_object('approved', n, 'frozen', true);
end; $$;
revoke all on function erp_cp_incentive_approve(uuid, date) from public, anon; grant execute on function erp_cp_incentive_approve(uuid, date) to authenticated;

create or replace function erp_cp_incentive_payouts_list(p_month date default null, p_program uuid default null, p_status text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v jsonb; v_all boolean := erp_fe_sees_all(); v_team uuid[] := array(select erp_fe_team());
  v_month date := case when p_month is null then null else date_trunc('month', p_month)::date end;
begin
  if v_company is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', po.id, 'program_id', po.program_id, 'program', pr.name, 'incentive_type', po.incentive_type,
      'period_month', po.period_month, 'dim_type', po.dim_type, 'dim_id', po.dim_id, 'label', erp_cp_dim_label(po.dim_type, po.dim_id),
      'metrics', po.metrics, 'conditions_met', po.conditions_met, 'rule_applied', po.rule_applied, 'payout', po.payout, 'status', po.status, 'frozen', po.frozen) order by po.payout desc), '[]'::jsonb) into v
  from erp_cp_incentive_payouts po join erp_cp_incentive_programs pr on pr.id = po.program_id
  where po.company_id=v_company
    and (v_all or (po.dim_type='rep' and po.dim_id = any(v_team::text[])) or (po.dim_type='route' and (select rep_id from erp_routes where id=nullif(po.dim_id,'')::uuid) = any(v_team)))
    and (v_month is null or po.period_month=v_month) and (p_program is null or po.program_id=p_program) and (p_status is null or po.status=p_status);
  return v;
end; $$;
revoke all on function erp_cp_incentive_payouts_list(date,uuid,text) from public, anon; grant execute on function erp_cp_incentive_payouts_list(date,uuid,text) to authenticated;

-- ── Combined payout statement (commission + incentive), per rep, scope-aware ─
create or replace function erp_cp_payout_statement(p_month date, p_rep uuid default null)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v jsonb; v_all boolean := erp_fe_sees_all(); v_team uuid[] := array(select erp_fe_team());
  v_month date := date_trunc('month', p_month)::date;
begin
  if v_company is null then return '[]'::jsonb; end if;
  with c as (select dim_id, sum(payout) amt from erp_cp_commission_payouts where company_id=v_company and period_month=v_month and dim_type='rep' group by dim_id),
  i as (select dim_id, sum(payout) amt from erp_cp_incentive_payouts where company_id=v_company and period_month=v_month and dim_type='rep' group by dim_id),
  reps as (select dim_id from c union select dim_id from i)
  select coalesce(jsonb_agg(jsonb_build_object('rep_id', r.dim_id, 'name', (select full_name from erp_profiles where id=r.dim_id::uuid),
      'commission', coalesce(c.amt,0), 'incentive', coalesce(i.amt,0), 'total', coalesce(c.amt,0)+coalesce(i.amt,0)) order by (coalesce(c.amt,0)+coalesce(i.amt,0)) desc), '[]'::jsonb) into v
  from reps r left join c on c.dim_id=r.dim_id left join i on i.dim_id=r.dim_id
  where (v_all or r.dim_id = any(v_team::text[])) and (p_rep is null or r.dim_id = p_rep::text);
  return v;
end; $$;
revoke all on function erp_cp_payout_statement(date, uuid) from public, anon; grant execute on function erp_cp_payout_statement(date, uuid) to authenticated;

-- ============================================================================
-- ROLLBACK (manual): drop erp_cp_payout_statement, erp_cp_incentive_payouts_list,
-- _approve, _run, _eval_conditions, _set_status, _new_version, _program_save;
-- drop tables erp_cp_incentive_payouts, erp_cp_incentive_programs.
-- ============================================================================
