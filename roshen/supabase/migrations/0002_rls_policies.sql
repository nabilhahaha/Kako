-- =====================================================================
-- Roshen KSA Branch Management Platform
-- 0002 — Role & access model (Row Level Security)  [PROPOSAL]
--
-- Model:
--   company_manager / admin  -> global read (and manage) within company
--   area_manager             -> read limited to assigned areas (via user_scope),
--                               and CANNOT see other areas (structure or data)
--   future roles             -> tighter scopes layered on the same helpers
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so policies can read profile/scope)
-- ---------------------------------------------------------------------
create or replace function app_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profile where id = auth.uid();
$$;

create or replace function is_global() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app_role() in ('company_manager','admin'), false);
$$;

-- Areas the current user may see: assigned directly, or all areas inside an
-- assigned region. Global roles bypass this via is_global() in each policy.
create or replace function my_area_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select a.id
  from area a
  where exists (
    select 1 from user_scope s
    where s.user_id = auth.uid()
      and (s.area_id = a.id or s.region_id = a.region_id)
  );
$$;

-- Regions implied by the user's assigned areas (for region-level context).
create or replace function my_region_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct a.region_id from area a where a.id in (select my_area_ids());
$$;

-- ---------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------
alter table company        enable row level security;
alter table country        enable row level security;
alter table region         enable row level security;
alter table city           enable row level security;
alter table area           enable row level security;
alter table branch         enable row level security;
alter table channel        enable row level security;
alter table agent          enable row level security;
alter table profile        enable row level security;
alter table user_scope     enable row level security;
alter table import_batch   enable row level security;
alter table raw_import_row enable row level security;
alter table sales_fact     enable row level security;
alter table sla_target     enable row level security;

-- ---------------------------------------------------------------------
-- Top-level, non-area-sensitive reference: readable by authenticated users,
-- writable by global roles only. (company, country, channel — channel is a
-- configurable list; cities are low-sensitivity geography.)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['company','country','channel','city']
  loop
    execute format('create policy %1$s_read on %1$s for select to authenticated using (true);', t);
    execute format('create policy %1$s_write on %1$s for all to authenticated using (is_global()) with check (is_global());', t);
  end loop;
end$$;

-- ---------------------------------------------------------------------
-- Area-sensitive structure: an area manager sees ONLY their slice.
-- ---------------------------------------------------------------------
-- region: global, or a region implied by an assigned area
create policy region_read on region for select to authenticated
  using (is_global() or id in (select my_region_ids()));
create policy region_write on region for all to authenticated
  using (is_global()) with check (is_global());

-- area: global, or assigned areas only
create policy area_read on area for select to authenticated
  using (is_global() or id in (select my_area_ids()));
create policy area_write on area for all to authenticated
  using (is_global()) with check (is_global());

-- branch: global, or branches inside assigned areas
create policy branch_read on branch for select to authenticated
  using (is_global() or area_id in (select my_area_ids()));
create policy branch_write on branch for all to authenticated
  using (is_global()) with check (is_global());

-- agent: global, or agents whose branch sits in an assigned area
create policy agent_read on agent for select to authenticated
  using (
    is_global()
    or branch_id in (select id from branch where area_id in (select my_area_ids()))
  );
create policy agent_write on agent for all to authenticated
  using (is_global()) with check (is_global());

-- ---------------------------------------------------------------------
-- profile & user_scope
-- ---------------------------------------------------------------------
create policy profile_self on profile for select to authenticated
  using (id = auth.uid() or is_global());
create policy profile_admin on profile for all to authenticated
  using (is_global()) with check (is_global());

create policy user_scope_read on user_scope for select to authenticated
  using (user_id = auth.uid() or is_global());
create policy user_scope_admin on user_scope for all to authenticated
  using (is_global()) with check (is_global());

-- ---------------------------------------------------------------------
-- Operational / reporting data: scoped by area for area managers.
-- ---------------------------------------------------------------------
-- sales_fact
create policy sales_fact_read on sales_fact for select to authenticated
  using (is_global() or area_id in (select my_area_ids()));
create policy sales_fact_write on sales_fact for all to authenticated
  using (is_global()) with check (is_global());

-- sla_target: global, or the target's area is in scope, or it is a
-- region/country target that covers an assigned area.
create policy sla_target_read on sla_target for select to authenticated
  using (
    is_global()
    or area_id in (select my_area_ids())
    or (level = 'region'  and region_id  in (select my_region_ids()))
  );
create policy sla_target_write on sla_target for all to authenticated
  using (is_global()) with check (is_global());

-- import_batch: global, or batches for agents whose branch is in an
-- assigned area.
create policy import_batch_read on import_batch for select to authenticated
  using (
    is_global()
    or agent_id in (
      select ag.id from agent ag
      join branch b on b.id = ag.branch_id
      where b.area_id in (select my_area_ids())
    )
  );
create policy import_batch_write on import_batch for all to authenticated
  using (is_global()) with check (is_global());

-- raw_import_row: visibility follows the parent batch (which is already
-- area-scoped above); writes are global-only.
create policy raw_row_read on raw_import_row for select to authenticated
  using (batch_id in (select id from import_batch));
create policy raw_row_write on raw_import_row for all to authenticated
  using (is_global()) with check (is_global());

-- NOTE: write paths for import/normalization are expected to run through
-- server actions using the service role (bypasses RLS) after app-level
-- authorization checks; the policies above govern direct client reads.
--
-- MULTI-COMPANY: company_id exists on every tenant table for future
-- isolation. When a second company is onboarded, add a my_company_id()
-- predicate (company_id = my_company_id()) to each policy; the current
-- policies already prevent cross-area access within the single company.
