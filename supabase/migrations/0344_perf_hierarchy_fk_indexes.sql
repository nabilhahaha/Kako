-- 0344_perf_hierarchy_fk_indexes.sql
-- Performance: cover the foreign keys on the configurable hierarchy tables that
-- the Supabase performance advisor flagged as unindexed. Purely additive btree
-- indexes — no behavior change, no RLS/structure change. They speed up FK
-- constraint checks (parent cascade / level lookups) and grow-safe as tenants
-- add levels/nodes. The *_company_id index on the node tables already exists
-- (erp_org_nodes_company_idx / erp_product_nodes_company_idx); only the missing
-- ones are added here. Idempotent.

create index if not exists erp_org_levels_company_idx     on public.erp_org_levels(company_id);
create index if not exists erp_org_levels_parent_idx      on public.erp_org_levels(parent_level_id);
create index if not exists erp_org_nodes_level_idx        on public.erp_org_nodes(level_id);
create index if not exists erp_org_nodes_parent_idx       on public.erp_org_nodes(parent_node_id);

create index if not exists erp_product_levels_company_idx on public.erp_product_levels(company_id);
create index if not exists erp_product_levels_parent_idx  on public.erp_product_levels(parent_level_id);
create index if not exists erp_product_nodes_level_idx    on public.erp_product_nodes(level_id);
create index if not exists erp_product_nodes_parent_idx   on public.erp_product_nodes(parent_node_id);
