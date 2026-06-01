-- ============================================================================
-- 0147: Trade Promotion Management (TPM-1) — promotion model + performance
-- ----------------------------------------------------------------------------
-- Promotion definitions (7 types), multi-dimension audience targeting (the 13
-- commercial dims), lifecycle (draft→approved→active→expired→archived), and the
-- management facts the brief asks to STORE: promotion cost, budget, period,
-- target audience, and actual performance (computed from the source-aware sales
-- facts over the promo period + audience). No ROI / trade-spend math yet — the
-- model just carries budget/cost so those can be layered on later.
--
-- Permissions: write = platform owner / company admin (Sales-Director approval
-- is an optional future role). Reads are scope-aware: managers see promotions
-- targeting their hierarchy (or company-wide ones); admins see all.
-- ============================================================================

create table if not exists erp_tpm_promotions (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references erp_companies(id) on delete cascade,
  name        text not null,
  promo_type  text not null check (promo_type in ('percentage','fixed_amount','buy_x_get_y','quantity','mix_match','bundle','free_gift')),
  params      jsonb not null default '{}'::jsonb,         -- type-specific config (discount_pct, buy/get, bundle skus…)
  starts_on   date not null,
  ends_on     date not null,
  budget      numeric,                                    -- promotion budget (cap)
  cost        numeric,                                    -- committed/estimated promotion cost
  status      text not null default 'draft' check (status in ('draft','approved','active','expired','archived')),
  notes       text,
  created_by  uuid, approved_by uuid, approved_at timestamptz,
  created_at  timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
-- audience: rows of (dim_type, dim_id); empty in a dimension-group = "all"
create table if not exists erp_tpm_promotion_targets (
  id          uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references erp_tpm_promotions(id) on delete cascade,
  company_id  uuid not null references erp_companies(id) on delete cascade,
  dim_type    text not null check (dim_type in ('company','region','area','branch','route','rep','channel','classification','customer','category','subcategory','brand','sku')),
  dim_id      text,
  created_at  timestamptz not null default now()
);
create unique index if not exists uq_tpm_targets on erp_tpm_promotion_targets(promotion_id, dim_type, (coalesce(dim_id,'')));
-- actual performance snapshot (latest per promotion)
create table if not exists erp_tpm_promotion_performance (
  promotion_id uuid primary key references erp_tpm_promotions(id) on delete cascade,
  company_id  uuid not null references erp_companies(id) on delete cascade,
  actual_value numeric not null default 0, actual_qty numeric not null default 0,
  customers   integer not null default 0, docs integer not null default 0,
  computed_at timestamptz not null default now()
);
create index if not exists idx_tpm_promo_company on erp_tpm_promotions(company_id, status, ends_on);
create index if not exists idx_tpm_targets_promo on erp_tpm_promotion_targets(promotion_id);

alter table erp_tpm_promotions enable row level security;
alter table erp_tpm_promotion_targets enable row level security;
alter table erp_tpm_promotion_performance enable row level security;
drop policy if exists erp_tpm_promo_read on erp_tpm_promotions;
create policy erp_tpm_promo_read on erp_tpm_promotions for select using ((select erp_is_platform_owner()) or company_id = (select erp_user_company_id()));
drop policy if exists erp_tpm_promo_write on erp_tpm_promotions;
create policy erp_tpm_promo_write on erp_tpm_promotions for all using ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))) with check ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id)));
drop policy if exists erp_tpm_targets_read on erp_tpm_promotion_targets;
create policy erp_tpm_targets_read on erp_tpm_promotion_targets for select using ((select erp_is_platform_owner()) or company_id = (select erp_user_company_id()));
drop policy if exists erp_tpm_targets_write on erp_tpm_promotion_targets;
create policy erp_tpm_targets_write on erp_tpm_promotion_targets for all using ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))) with check ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id)));
drop policy if exists erp_tpm_perf_read on erp_tpm_promotion_performance;
create policy erp_tpm_perf_read on erp_tpm_promotion_performance for select using ((select erp_is_platform_owner()) or company_id = (select erp_user_company_id()));
drop policy if exists erp_tpm_perf_write on erp_tpm_promotion_performance;
create policy erp_tpm_perf_write on erp_tpm_promotion_performance for all using ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))) with check ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id)));
drop trigger if exists trg_audit_erp_tpm_promotions on erp_tpm_promotions;
create trigger trg_audit_erp_tpm_promotions after insert or update or delete on erp_tpm_promotions for each row execute function erp_audit_capture();
drop trigger if exists erp_tpm_promotions_updated on erp_tpm_promotions;
create trigger erp_tpm_promotions_updated before update on erp_tpm_promotions for each row execute function erp_set_updated_at();

-- ── Authoring (admin) ──────────────────────────────────────────────────────
create or replace function erp_tpm_promotion_save(
  p_name text, p_type text, p_starts date, p_ends date, p_budget numeric default null, p_cost numeric default null,
  p_params jsonb default '{}'::jsonb, p_notes text default null, p_id uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_id uuid := p_id;
begin
  if v_company is null or not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  if p_id is null then
    insert into erp_tpm_promotions (company_id, name, promo_type, params, starts_on, ends_on, budget, cost, notes, created_by)
      values (v_company, p_name, p_type, coalesce(p_params,'{}'::jsonb), p_starts, p_ends, p_budget, p_cost, p_notes, (select auth.uid())) returning id into v_id;
  else
    update erp_tpm_promotions set name=p_name, promo_type=p_type, params=coalesce(p_params,'{}'::jsonb), starts_on=p_starts, ends_on=p_ends,
      budget=p_budget, cost=p_cost, notes=p_notes, updated_at=now() where id=p_id and company_id=v_company and status='draft';
  end if;
  return jsonb_build_object('id', v_id);
end; $$;
revoke all on function erp_tpm_promotion_save(text,text,date,date,numeric,numeric,jsonb,text,uuid) from public, anon;
grant execute on function erp_tpm_promotion_save(text,text,date,date,numeric,numeric,jsonb,text,uuid) to authenticated;

-- add an audience target (resolves a friendly ref; scope-checked)
create or replace function erp_tpm_target_add(p_promo uuid, p_dim_type text, p_dim_id text default null, p_dim_ref text default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_id text := nullif(p_dim_id,'');
begin
  if v_company is null or not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  if not exists(select 1 from erp_tpm_promotions where id=p_promo and company_id=v_company) then raise exception 'not found'; end if;
  if v_id is null and nullif(p_dim_ref,'') is not null and p_dim_type <> 'company' then v_id := erp_cp_resolve_dim(p_dim_type, p_dim_ref);
    if v_id is null then raise exception 'unknown ref'; end if; end if;
  insert into erp_tpm_promotion_targets (promotion_id, company_id, dim_type, dim_id) values (p_promo, v_company, p_dim_type, v_id)
    on conflict (promotion_id, dim_type, (coalesce(dim_id,''))) do nothing;
  return jsonb_build_object('ok', true, 'dim_id', v_id);
end; $$;
revoke all on function erp_tpm_target_add(uuid,text,text,text) from public, anon; grant execute on function erp_tpm_target_add(uuid,text,text,text) to authenticated;

-- lifecycle (admin / owner; Sales-Director approval is a future optional role)
create or replace function erp_tpm_set_status(p_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id();
begin
  if v_company is null or not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  if p_status not in ('draft','approved','active','expired','archived') then raise exception 'bad status'; end if;
  update erp_tpm_promotions set status=p_status,
    approved_by = case when p_status='approved' then (select auth.uid()) else approved_by end,
    approved_at = case when p_status='approved' then now() else approved_at end, updated_at=now()
    where id=p_id and company_id=v_company;
  if not found then raise exception 'not found'; end if;
  return jsonb_build_object('ok', true, 'status', p_status);
end; $$;
revoke all on function erp_tpm_set_status(uuid, text) from public, anon; grant execute on function erp_tpm_set_status(uuid, text) to authenticated;

-- ── Actual performance: source-aware sales over the promo period + audience ─
create or replace function erp_tpm_promotion_actuals(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); pr erp_tpm_promotions; v_src text; v jsonb;
  geo text[] := array['region','area','branch','route','rep','customer','channel','classification','company']; prod text[] := array['category','subcategory','brand','sku'];
begin
  if v_company is null then return null; end if;
  select * into pr from erp_tpm_promotions where id=p_id and company_id=v_company; if not found then return null; end if;
  v_src := erp_cp_primary_source(v_company);
  select jsonb_build_object('actual_value', round(coalesce(sum(s.value),0),2), 'actual_qty', coalesce(sum(s.qty),0),
    'customers', count(distinct s.customer_id), 'docs', count(distinct s.doc_id),
    'budget', pr.budget, 'cost', pr.cost, 'period', jsonb_build_object('from', pr.starts_on, 'to', pr.ends_on)) into v
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
  return v;
end; $$;
revoke all on function erp_tpm_promotion_actuals(uuid) from public, anon; grant execute on function erp_tpm_promotion_actuals(uuid) to authenticated;

-- snapshot the actuals (admin)
create or replace function erp_tpm_refresh_performance(p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); a jsonb;
begin
  if v_company is null or not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  a := erp_tpm_promotion_actuals(p_id); if a is null then raise exception 'not found'; end if;
  insert into erp_tpm_promotion_performance (promotion_id, company_id, actual_value, actual_qty, customers, docs, computed_at)
    values (p_id, v_company, (a->>'actual_value')::numeric, (a->>'actual_qty')::numeric, (a->>'customers')::int, (a->>'docs')::int, now())
  on conflict (promotion_id) do update set actual_value=excluded.actual_value, actual_qty=excluded.actual_qty, customers=excluded.customers, docs=excluded.docs, computed_at=now();
  return a;
end; $$;
revoke all on function erp_tpm_refresh_performance(uuid) from public, anon; grant execute on function erp_tpm_refresh_performance(uuid) to authenticated;

-- ── Scope-aware list (managers see promos targeting their hierarchy or all) ─
create or replace function erp_tpm_promotions_list(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v jsonb; v_all boolean := erp_fe_sees_all(); v_team uuid[] := array(select erp_fe_team());
begin
  if v_company is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'promo_type', p.promo_type, 'params', p.params,
      'starts_on', p.starts_on, 'ends_on', p.ends_on, 'budget', p.budget, 'cost', p.cost, 'status', p.status,
      'targets', (select coalesce(jsonb_agg(jsonb_build_object('dim_type', t.dim_type, 'dim_id', t.dim_id, 'label', erp_cp_dim_label(t.dim_type, t.dim_id))), '[]'::jsonb)
        from erp_tpm_promotion_targets t where t.promotion_id=p.id),
      'performance', (select jsonb_build_object('actual_value', pf.actual_value, 'actual_qty', pf.actual_qty, 'customers', pf.customers, 'computed_at', pf.computed_at)
        from erp_tpm_promotion_performance pf where pf.promotion_id=p.id)) order by p.ends_on desc), '[]'::jsonb) into v
  from erp_tpm_promotions p
  where p.company_id=v_company and (p_status is null or p.status=p_status)
    and (v_all                                                            -- scope
      or not exists (select 1 from erp_tpm_promotion_targets t where t.promotion_id=p.id and t.dim_type in ('rep','route','customer'))  -- company/broad → visible
      or exists (select 1 from erp_tpm_promotion_targets t where t.promotion_id=p.id and (
          (t.dim_type='rep' and t.dim_id = any(v_team::text[]))
          or (t.dim_type='route' and (select rep_id from erp_routes where id=nullif(t.dim_id,'')::uuid) = any(v_team))
          or (t.dim_type='customer' and (select salesman_id from erp_customers where id=nullif(t.dim_id,'')::uuid) = any(v_team)))));
  return v;
end; $$;
revoke all on function erp_tpm_promotions_list(text) from public, anon; grant execute on function erp_tpm_promotions_list(text) to authenticated;

-- ============================================================================
-- ROLLBACK (manual): drop erp_tpm_promotions_list / _refresh_performance /
-- _promotion_actuals / _set_status / _target_add / _promotion_save; drop tables
-- erp_tpm_promotion_performance, erp_tpm_promotion_targets, erp_tpm_promotions.
-- ============================================================================
