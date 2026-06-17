-- 0343_product_hierarchy.sql
-- Onboarding gap #3: configurable Product Hierarchy (levels + nodes), per company.
-- Backward-compatible: SEEDED from the existing erp_product_categories tree;
-- erp_product_categories remains the canonical category entity (each product node
-- carries legacy_ref to its category, and erp_products_catalog.category_id is
-- untouched). Company-scoped RLS, identical to the org hierarchy. No engine change.

create table if not exists public.erp_product_levels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.erp_companies(id) on delete cascade,
  name text not null,
  name_ar text,
  depth int not null default 1,
  sort_order int not null default 0,
  parent_level_id uuid references public.erp_product_levels(id) on delete set null,
  system_key text,                       -- 'category' (compat) | null = custom
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.erp_product_nodes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.erp_companies(id) on delete cascade,
  level_id uuid not null references public.erp_product_levels(id) on delete cascade,
  parent_node_id uuid references public.erp_product_nodes(id) on delete set null,
  name text not null,
  name_ar text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  legacy_ref_type text,                  -- 'category'
  legacy_ref_id uuid,                    -- the existing erp_product_categories row
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists erp_product_nodes_company_idx on public.erp_product_nodes(company_id);
create unique index if not exists erp_product_nodes_legacy_uq on public.erp_product_nodes(company_id, legacy_ref_type, legacy_ref_id) where legacy_ref_id is not null;

alter table public.erp_product_levels enable row level security;
alter table public.erp_product_nodes  enable row level security;
drop policy if exists erp_product_levels_rw on public.erp_product_levels;
create policy erp_product_levels_rw on public.erp_product_levels for all
  using (erp_is_platform_owner() or company_id = erp_user_company_id())
  with check (erp_is_platform_owner() or company_id = erp_user_company_id());
drop policy if exists erp_product_nodes_rw on public.erp_product_nodes;
create policy erp_product_nodes_rw on public.erp_product_nodes for all
  using (erp_is_platform_owner() or company_id = erp_user_company_id())
  with check (erp_is_platform_owner() or company_id = erp_user_company_id());

-- Idempotent seed from the existing category tree (callable per company; owner-only)
create or replace function public.erp_seed_product_hierarchy(p_company uuid)
returns void language plpgsql security definer set search_path to 'public','pg_temp' as $fn$
declare
  has_cat bool;
  lvl_cat uuid;
begin
  select exists(select 1 from erp_product_categories where company_id=p_company) into has_cat;
  if not has_cat then return; end if;

  select id into lvl_cat from erp_product_levels where company_id=p_company and system_key='category';
  if lvl_cat is null then
    insert into erp_product_levels(company_id,name,name_ar,depth,sort_order,parent_level_id,system_key)
    values(p_company,'Category','الفئة',1,1,null,'category') returning id into lvl_cat;
  end if;

  -- Pass 1: insert every category as a node (parent set in pass 2 once all exist).
  insert into erp_product_nodes(company_id,level_id,parent_node_id,name,name_ar,sort_order,is_active,legacy_ref_type,legacy_ref_id)
  select p_company,lvl_cat,null,c.name,c.name_ar,coalesce(c.sort_order,0),coalesce(c.is_active,true),'category',c.id
  from erp_product_categories c where c.company_id=p_company
    and not exists(select 1 from erp_product_nodes n where n.company_id=p_company and n.legacy_ref_type='category' and n.legacy_ref_id=c.id);

  -- Pass 2: wire parent links by mapping category.parent_id → its node.
  update erp_product_nodes n
  set parent_node_id = pn.id
  from erp_product_categories c
  join erp_product_nodes pn
    on pn.company_id=p_company and pn.legacy_ref_type='category' and pn.legacy_ref_id=c.parent_id
  where n.company_id=p_company and n.legacy_ref_type='category' and n.legacy_ref_id=c.id
    and c.parent_id is not null and n.parent_node_id is distinct from pn.id;
end $fn$;

-- One-time backfill of every existing company (idempotent).
do $$ declare c uuid; begin
  for c in select id from erp_companies loop perform public.erp_seed_product_hierarchy(c); end loop;
end $$;
