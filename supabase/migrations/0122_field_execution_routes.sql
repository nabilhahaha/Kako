-- ============================================================================
-- 0122: Field Execution (FE-3a) — frequency rules, route plans, stops, linkage
-- ----------------------------------------------------------------------------
-- The planning layer under field_ops:
--   • erp_fe_customer_frequency — per-customer call pattern (weekday mask +
--     week-of-month + calls/cycle): supports weekly, twice/week, bi-weekly,
--     F2/F4 monthly and future patterns.
--   • erp_fe_route_plans         — a rep's journey for a day (draft→published→
--     in_progress→done).
--   • erp_fe_route_stops          — the planned customers of a plan (due flag,
--     visited/missed/skipped, linked visit).
--   • erp_fe_customer_due(cust,d) — evaluates the frequency rule for a date.
--   • visit→stop linkage trigger  — a check-in marks its plan stop visited and
--     stamps the visit's plan_id; off-plan visits stay unlinked.
-- Coverage math + plan generation + daily facts land in FE-3b/FE-3c. Additive.
-- ============================================================================

-- ── Customer frequency (call pattern) ──────────────────────────────────────
create table if not exists erp_fe_customer_frequency (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references erp_companies(id) on delete cascade,
  customer_id    uuid not null references erp_customers(id) on delete cascade,
  route_id       uuid references erp_routes(id) on delete set null,
  frequency      text not null default 'weekly' check (frequency in ('daily','weekly','biweekly','monthly','custom')),
  weekdays       smallint[],          -- 0=Sun … 6=Sat (which days the customer is due)
  week_of_month  smallint[],          -- 1..5 (bi-weekly/monthly: which weeks)
  calls_per_cycle integer,            -- informational (F2/F4)
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (company_id, customer_id)
);
create index if not exists idx_fe_freq_route on erp_fe_customer_frequency(company_id, route_id);

-- ── Route plans (daily journey) ────────────────────────────────────────────
create table if not exists erp_fe_route_plans (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references erp_companies(id) on delete cascade,
  route_id      uuid references erp_routes(id) on delete set null,
  rep_id        uuid references erp_profiles(id) on delete set null,
  plan_date     date not null,
  status        text not null default 'draft' check (status in ('draft','published','in_progress','done')),
  generated_at  timestamptz,
  published_at  timestamptz,
  created_by    uuid references erp_profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (company_id, route_id, plan_date)
);
create index if not exists idx_fe_plans_lookup on erp_fe_route_plans(company_id, plan_date, status);
create index if not exists idx_fe_plans_rep on erp_fe_route_plans(rep_id, plan_date);

-- ── Route stops (planned customers) ────────────────────────────────────────
create table if not exists erp_fe_route_stops (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references erp_companies(id) on delete cascade,
  plan_id      uuid not null references erp_fe_route_plans(id) on delete cascade,
  customer_id  uuid not null references erp_customers(id) on delete cascade,
  seq          integer not null default 0,
  due          boolean not null default true,
  status       text not null default 'planned' check (status in ('planned','visited','missed','skipped')),
  visit_id     uuid references erp_fe_visits(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (plan_id, customer_id)
);
create index if not exists idx_fe_stops_plan on erp_fe_route_stops(plan_id, seq);
create index if not exists idx_fe_stops_customer on erp_fe_route_stops(company_id, customer_id);

-- visits.plan_id → plans (set by the linkage trigger)
alter table erp_fe_visits drop constraint if exists erp_fe_visits_plan_fk;
alter table erp_fe_visits add constraint erp_fe_visits_plan_fk
  foreign key (plan_id) references erp_fe_route_plans(id) on delete set null;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table erp_fe_customer_frequency enable row level security;
alter table erp_fe_route_plans        enable row level security;
alter table erp_fe_route_stops        enable row level security;

-- Frequency: read = customers/field_ops view or admin; write = field_ops:plan or admin.
drop policy if exists erp_fe_freq_read on erp_fe_customer_frequency;
create policy erp_fe_freq_read on erp_fe_customer_frequency for select using (
  (select erp_is_platform_owner()) or (company_id = (select erp_user_company_id()) and (
    (select erp_matrix_has('field_ops','view')) or (select erp_matrix_has('customers','view')) or (select erp_is_company_admin(company_id))))
);
drop policy if exists erp_fe_freq_write on erp_fe_customer_frequency;
create policy erp_fe_freq_write on erp_fe_customer_frequency for all using (
  (select erp_is_platform_owner()) or (company_id = (select erp_user_company_id()) and ((select erp_matrix_has('field_ops','plan')) or (select erp_is_company_admin(company_id))))
) with check (
  (select erp_is_platform_owner()) or (company_id = (select erp_user_company_id()) and ((select erp_matrix_has('field_ops','plan')) or (select erp_is_company_admin(company_id))))
);

-- Plans: read = own rep / field_ops view|plan / admin; write = field_ops:plan or admin.
drop policy if exists erp_fe_plans_read on erp_fe_route_plans;
create policy erp_fe_plans_read on erp_fe_route_plans for select using (
  (select erp_is_platform_owner()) or (company_id = (select erp_user_company_id()) and (
    rep_id = (select auth.uid()) or (select erp_matrix_has('field_ops','view')) or (select erp_matrix_has('field_ops','plan')) or (select erp_is_company_admin(company_id))))
);
drop policy if exists erp_fe_plans_write on erp_fe_route_plans;
create policy erp_fe_plans_write on erp_fe_route_plans for all using (
  (select erp_is_platform_owner()) or (company_id = (select erp_user_company_id()) and ((select erp_matrix_has('field_ops','plan')) or (select erp_is_company_admin(company_id))))
) with check (
  (select erp_is_platform_owner()) or (company_id = (select erp_user_company_id()) and ((select erp_matrix_has('field_ops','plan')) or (select erp_is_company_admin(company_id))))
);

-- Stops: read = company member with plan visibility; write = field_ops:plan or admin
-- (the linkage trigger updates stops via SECURITY DEFINER, independent of RLS).
drop policy if exists erp_fe_stops_read on erp_fe_route_stops;
create policy erp_fe_stops_read on erp_fe_route_stops for select using (
  (select erp_is_platform_owner()) or (company_id = (select erp_user_company_id()) and (
    (select erp_matrix_has('field_ops','view')) or (select erp_matrix_has('field_ops','plan')) or (select erp_is_company_admin(company_id))
    or exists (select 1 from erp_fe_route_plans p where p.id = plan_id and p.rep_id = (select auth.uid()))))
);
drop policy if exists erp_fe_stops_write on erp_fe_route_stops;
create policy erp_fe_stops_write on erp_fe_route_stops for all using (
  (select erp_is_platform_owner()) or (company_id = (select erp_user_company_id()) and ((select erp_matrix_has('field_ops','plan')) or (select erp_is_company_admin(company_id))))
) with check (
  (select erp_is_platform_owner()) or (company_id = (select erp_user_company_id()) and ((select erp_matrix_has('field_ops','plan')) or (select erp_is_company_admin(company_id))))
);

-- ── Audit + updated_at ─────────────────────────────────────────────────────
do $attach$
declare tname text;
begin
  foreach tname in array array['erp_fe_customer_frequency','erp_fe_route_plans','erp_fe_route_stops'] loop
    execute format('drop trigger if exists trg_audit_%1$s on %1$s', tname);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on %1$s for each row execute function erp_audit_capture()', tname);
  end loop;
  foreach tname in array array['erp_fe_customer_frequency','erp_fe_route_plans'] loop
    execute format('drop trigger if exists %1$s_updated on %1$s', tname);
    execute format('create trigger %1$s_updated before update on %1$s for each row execute function erp_set_updated_at()', tname);
  end loop;
end $attach$;

-- ── erp_fe_customer_due: is the customer due on a date per its frequency? ───
create or replace function erp_fe_customer_due(p_customer uuid, p_date date)
returns boolean language plpgsql stable security definer
set search_path to 'public','pg_temp' as $$
declare f erp_fe_customer_frequency; v_dow int; v_wom int;
begin
  select * into f from erp_fe_customer_frequency where customer_id = p_customer and active;
  if f.id is null then return false; end if;            -- no rule ⇒ not part of the call plan
  if f.frequency = 'daily' then return true; end if;
  if f.weekdays is null or array_length(f.weekdays, 1) is null then return false; end if;
  v_dow := extract(dow from p_date)::int;               -- 0=Sun … 6=Sat
  if not (v_dow = any(f.weekdays)) then return false; end if;
  if f.frequency = 'weekly' then return true; end if;
  -- biweekly / monthly / custom: optionally constrain by week-of-month
  if f.week_of_month is null or array_length(f.week_of_month, 1) is null then return true; end if;
  v_wom := ((extract(day from p_date)::int - 1) / 7) + 1;
  return v_wom = any(f.week_of_month);
end; $$;
revoke all on function erp_fe_customer_due(uuid, date) from public, anon;
grant execute on function erp_fe_customer_due(uuid, date) to authenticated;

-- ── Visit → stop linkage (a check-in fulfils its planned stop) ─────────────
create or replace function erp_fe_link_visit_stop()
returns trigger language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare v_stop uuid; v_plan uuid;
begin
  if pg_trigger_depth() > 1 then return null; end if;   -- guard the self-update below
  if NEW.customer_id is null then return null; end if;
  select s.id, s.plan_id into v_stop, v_plan
    from erp_fe_route_stops s
    join erp_fe_route_plans p on p.id = s.plan_id
   where s.company_id = NEW.company_id
     and s.customer_id = NEW.customer_id
     and p.plan_date = (coalesce(NEW.checkin_at, now()))::date
     and p.status in ('published','in_progress','done')
   order by p.published_at desc nulls last
   limit 1;
  if v_stop is not null then
    update erp_fe_route_stops set status = 'visited', visit_id = NEW.id where id = v_stop and status <> 'visited';
    if NEW.plan_id is distinct from v_plan then
      update erp_fe_visits set plan_id = v_plan where id = NEW.id;
    end if;
  end if;
  return null;
end; $$;
drop trigger if exists trg_fe_link_visit on erp_fe_visits;
create trigger trg_fe_link_visit after insert or update on erp_fe_visits
  for each row execute function erp_fe_link_visit_stop();

-- ============================================================================
-- ROLLBACK (manual): drop trg_fe_link_visit + erp_fe_link_visit_stop;
-- erp_fe_customer_due; the visits.plan_id FK; tables erp_fe_route_stops,
-- erp_fe_route_plans, erp_fe_customer_frequency.
-- ============================================================================
