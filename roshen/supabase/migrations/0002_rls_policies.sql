-- =====================================================================
-- Roshen KSA Branch Management Platform
-- 0002 — Role & access model (Row Level Security)  [PROPOSAL]
--
-- Model:
--   company_manager / admin  -> global read (and manage)
--   area_manager             -> read limited to assigned areas (via user_scope)
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

-- Areas the current user may see. Global roles see everything (NULL set is
-- handled by is_global() short-circuit in policies). Area managers get the
-- areas they are assigned to, plus all areas inside any assigned region.
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

-- ---------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------
alter table company       enable row level security;
alter table country       enable row level security;
alter table region        enable row level security;
alter table city          enable row level security;
alter table area          enable row level security;
alter table branch        enable row level security;
alter table channel       enable row level security;
alter table agent         enable row level security;
alter table profile       enable row level security;
alter table user_scope    enable row level security;
alter table import_batch  enable row level security;
alter table raw_import_row enable row level security;
alter table sales_fact    enable row level security;
alter table sla_target    enable row level security;

-- ---------------------------------------------------------------------
-- Reference dimensions: any authenticated user may read; only global
-- roles may write. (Org structure is small and not sensitive to read.)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['company','country','region','city','area','branch','channel','agent']
  loop
    execute format('create policy %1$s_read on %1$s for select to authenticated using (true);', t);
    execute format('create policy %1$s_write on %1$s for all to authenticated using (is_global()) with check (is_global());', t);
  end loop;
end$$;

-- ---------------------------------------------------------------------
-- profile: a user sees their own row; global roles see all.
-- ---------------------------------------------------------------------
create policy profile_self on profile for select to authenticated
  using (id = auth.uid() or is_global());
create policy profile_admin on profile for all to authenticated
  using (is_global()) with check (is_global());

-- user_scope: visible to the owner and global roles; managed by global roles.
create policy user_scope_read on user_scope for select to authenticated
  using (user_id = auth.uid() or is_global());
create policy user_scope_admin on user_scope for all to authenticated
  using (is_global()) with check (is_global());

-- ---------------------------------------------------------------------
-- Operational data: scoped by area for area managers, global otherwise.
-- ---------------------------------------------------------------------
-- sales_fact
create policy sales_fact_read on sales_fact for select to authenticated
  using (is_global() or area_id in (select my_area_ids()));

-- sla_target: visible if global, or the target's area is in scope, or it is
-- a higher-level (country/region) target that covers an assigned area.
create policy sla_target_read on sla_target for select to authenticated
  using (
    is_global()
    or area_id in (select my_area_ids())
    or (level = 'region' and region_id in (select region_id from area where id in (select my_area_ids())))
  );
create policy sla_target_write on sla_target for all to authenticated
  using (is_global()) with check (is_global());

-- import_batch / raw rows: global manage; area managers read batches for
-- agents whose branch sits in one of their areas.
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

create policy raw_row_read on raw_import_row for select to authenticated
  using (
    is_global()
    or batch_id in (select id from import_batch)   -- batch policy already filters
  );
create policy raw_row_write on raw_import_row for all to authenticated
  using (is_global()) with check (is_global());

-- NOTE: write paths for import/normalization are expected to run through
-- server actions using the service role (bypasses RLS) after app-level
-- authorization checks; the policies above govern direct client reads.
