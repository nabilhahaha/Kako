-- =====================================================================
-- Roshen KSA — 0008 Organization simplification
--   Region → City → Distributor + city-level visibility scope
--
-- Rationale: the Roshen KSA org is managed as Region → City → Distributor.
-- Areas/Branches stay in the schema for future expansion but are no longer
-- the primary path. Distributors therefore get a DIRECT city link (and an
-- optional assigned Area Manager), and `branch_id` becomes optional.
--
-- Visibility: Area Managers will be assigned Region / City / Distributor
-- scope via `user_scope`. This adds the missing CITY level.
--
-- All changes are ADDITIVE except one constraint RELAX (agent.branch_id is
-- made nullable). No data is dropped. Existing area/branch-based rows keep
-- working — `my_area_ids()` is extended, not replaced.
-- =====================================================================

-- --- Distributor (agent) gains direct city + optional assigned Area Manager
alter table agent add column if not exists city_id uuid references city(id) on delete set null;
alter table agent add column if not exists area_manager_id uuid references profile(id) on delete set null;
alter table agent alter column branch_id drop not null;
create index if not exists agent_city_idx on agent (city_id);
create index if not exists agent_area_manager_idx on agent (area_manager_id);

-- --- City-level visibility scope for Area Managers
alter type org_level add value if not exists 'city';
alter table user_scope add column if not exists city_id uuid references city(id) on delete cascade;
create index if not exists user_scope_city_idx on user_scope (city_id);

-- --- Scope resolution now understands city scope and city-based distributors.
--     (region/area/branch/agent still resolve exactly as before.)
create or replace function my_area_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select a.id
  from area a
  where exists (
    select 1 from user_scope s
    where s.user_id = auth.uid()
      and (
        s.area_id = a.id
        or s.region_id = a.region_id
        or s.city_id in (select c.id from city c where c.region_id = a.region_id)
        or s.branch_id in (select b.id from branch b where b.area_id = a.id)
        or s.agent_id in (
             select ag.id from agent ag
             left join branch b on b.id = ag.branch_id
             left join city   c on c.id = ag.city_id
             where b.area_id = a.id or c.region_id = a.region_id
        )
      )
  );
$$;

-- --- Distributor read policy: also expose city-based distributors that fall
--     in an assigned region/city (branch may now be null).
alter policy agent_read on agent
  using (
    is_global()
    or branch_id in (select id from branch where area_id in (select my_area_ids()))
    or city_id in (
         select c.id from city c
         join area a on a.region_id = c.region_id
         where a.id in (select my_area_ids())
       )
  );

-- (agent_write, user_scope writes, city/region writes remain admin / is_global
--  as set in 0002/0005 — Area Managers stay read-only on master data.)
