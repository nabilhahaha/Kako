-- 0342_org_hierarchy.sql
-- Onboarding gap #2: configurable Organization Hierarchy (levels + nodes), per company.
-- Backward-compatible: SEEDED from existing erp_regions/areas/branches/teams; erp_branches
-- remains the canonical branch entity (each branch node carries legacy_ref to its branch).
-- The frozen authorization / RLS / reports_to scoping is UNCHANGED (this is structural
-- config only; visibility still reads erp_user_subtree). Company-scoped RLS. No engine change.

create table if not exists public.erp_org_levels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.erp_companies(id) on delete cascade,
  name text not null,
  name_ar text,
  depth int not null default 1,
  sort_order int not null default 0,
  parent_level_id uuid references public.erp_org_levels(id) on delete set null,
  can_hold_users boolean not null default false,
  can_hold_manager boolean not null default true,
  system_key text,                       -- 'region'|'area'|'branch'|'team' (compat) | null = custom
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.erp_org_nodes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.erp_companies(id) on delete cascade,
  level_id uuid not null references public.erp_org_levels(id) on delete cascade,
  parent_node_id uuid references public.erp_org_nodes(id) on delete set null,
  name text not null,
  name_ar text,
  manager_user_id uuid,
  sort_order int not null default 0,
  is_active boolean not null default true,
  legacy_ref_type text,                  -- 'region'|'area'|'branch'|'team'
  legacy_ref_id uuid,                    -- → the existing row (keeps branch_id refs intact)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists erp_org_nodes_company_idx on public.erp_org_nodes(company_id);
create unique index if not exists erp_org_nodes_legacy_uq on public.erp_org_nodes(company_id, legacy_ref_type, legacy_ref_id) where legacy_ref_id is not null;

alter table public.erp_org_levels enable row level security;
alter table public.erp_org_nodes  enable row level security;
drop policy if exists erp_org_levels_rw on public.erp_org_levels;
create policy erp_org_levels_rw on public.erp_org_levels for all
  using (erp_is_platform_owner() or company_id = erp_user_company_id())
  with check (erp_is_platform_owner() or company_id = erp_user_company_id());
drop policy if exists erp_org_nodes_rw on public.erp_org_nodes;
create policy erp_org_nodes_rw on public.erp_org_nodes for all
  using (erp_is_platform_owner() or company_id = erp_user_company_id())
  with check (erp_is_platform_owner() or company_id = erp_user_company_id());

-- ── Idempotent seed from existing structure (callable per company; owner-only) ──
create or replace function public.erp_seed_org_hierarchy(p_company uuid)
returns void language plpgsql security definer set search_path to 'public','pg_temp' as $fn$
declare
  has_region bool; has_area bool; has_team bool;
  lvl_region uuid; lvl_area uuid; lvl_branch uuid; lvl_team uuid;
begin
  select exists(select 1 from erp_regions where company_id=p_company) into has_region;
  select exists(select 1 from erp_areas   where company_id=p_company) into has_area;
  select exists(select 1 from erp_teams   where company_id=p_company) into has_team;

  if has_region then
    select id into lvl_region from erp_org_levels where company_id=p_company and system_key='region';
    if lvl_region is null then
      insert into erp_org_levels(company_id,name,name_ar,depth,sort_order,parent_level_id,can_hold_users,can_hold_manager,system_key)
      values(p_company,'Region','المنطقة',1,1,null,false,true,'region') returning id into lvl_region;
    end if;
  end if;
  if has_area then
    select id into lvl_area from erp_org_levels where company_id=p_company and system_key='area';
    if lvl_area is null then
      insert into erp_org_levels(company_id,name,name_ar,depth,sort_order,parent_level_id,can_hold_users,can_hold_manager,system_key)
      values(p_company,'Area','القطاع',2,2,lvl_region,false,true,'area') returning id into lvl_area;
    end if;
  end if;
  select id into lvl_branch from erp_org_levels where company_id=p_company and system_key='branch';
  if lvl_branch is null then
    insert into erp_org_levels(company_id,name,name_ar,depth,sort_order,parent_level_id,can_hold_users,can_hold_manager,system_key)
    values(p_company,'Branch','الفرع',3,3,coalesce(lvl_area,lvl_region),true,true,'branch') returning id into lvl_branch;
  end if;
  if has_team then
    select id into lvl_team from erp_org_levels where company_id=p_company and system_key='team';
    if lvl_team is null then
      insert into erp_org_levels(company_id,name,name_ar,depth,sort_order,parent_level_id,can_hold_users,can_hold_manager,system_key)
      values(p_company,'Team','الفريق',4,4,lvl_branch,true,true,'team') returning id into lvl_team;
    end if;
  end if;

  if has_region then
    insert into erp_org_nodes(company_id,level_id,parent_node_id,name,name_ar,manager_user_id,sort_order,legacy_ref_type,legacy_ref_id)
    select p_company,lvl_region,null,r.name,r.name_ar,r.manager_id,coalesce(r.sort,0),'region',r.id
    from erp_regions r where r.company_id=p_company
      and not exists(select 1 from erp_org_nodes n where n.company_id=p_company and n.legacy_ref_type='region' and n.legacy_ref_id=r.id);
  end if;
  if has_area then
    insert into erp_org_nodes(company_id,level_id,parent_node_id,name,name_ar,manager_user_id,sort_order,legacy_ref_type,legacy_ref_id)
    select p_company,lvl_area,
      (select n.id from erp_org_nodes n where n.company_id=p_company and n.legacy_ref_type='region' and n.legacy_ref_id=a.region_id),
      a.name,a.name_ar,a.manager_id,coalesce(a.sort,0),'area',a.id
    from erp_areas a where a.company_id=p_company
      and not exists(select 1 from erp_org_nodes n where n.company_id=p_company and n.legacy_ref_type='area' and n.legacy_ref_id=a.id);
  end if;
  insert into erp_org_nodes(company_id,level_id,parent_node_id,name,name_ar,manager_user_id,sort_order,legacy_ref_type,legacy_ref_id)
  select p_company,lvl_branch,
    coalesce(
      (select n.id from erp_org_nodes n where n.company_id=p_company and n.legacy_ref_type='area'   and n.legacy_ref_id=b.area_id),
      (select n.id from erp_org_nodes n where n.company_id=p_company and n.legacy_ref_type='region' and n.legacy_ref_id=b.region_id)
    ),
    b.name,b.name_ar,null,0,'branch',b.id
  from erp_branches b where b.company_id=p_company
    and not exists(select 1 from erp_org_nodes n where n.company_id=p_company and n.legacy_ref_type='branch' and n.legacy_ref_id=b.id);
  if has_team then
    insert into erp_org_nodes(company_id,level_id,parent_node_id,name,name_ar,manager_user_id,sort_order,legacy_ref_type,legacy_ref_id)
    select p_company,lvl_team,null,tm.name,tm.name_ar,tm.lead_id,0,'team',tm.id
    from erp_teams tm where tm.company_id=p_company
      and not exists(select 1 from erp_org_nodes n where n.company_id=p_company and n.legacy_ref_type='team' and n.legacy_ref_id=tm.id);
  end if;
end $fn$;

-- One-time backfill of every existing company (idempotent).
do $$ declare c uuid; begin
  for c in select id from erp_companies loop perform public.erp_seed_org_hierarchy(c); end loop;
end $$;
