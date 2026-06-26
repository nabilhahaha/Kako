-- =====================================================================
-- Roshen KSA — Foundation ROLLBACK (down) script  [DESTRUCTIVE — DO NOT RUN
-- unless you intend to remove the foundation objects]
--
-- Safe to run ONLY against a project where these objects were created by
-- migrations 0001–0003 and contain no data you need. It drops only the
-- objects this foundation introduced, in dependency order. It does NOT
-- touch auth.* or any pre-existing schema.
-- =====================================================================

-- Views first
drop view if exists sla_actual_agent_ytd     cascade;
drop view if exists sla_performance          cascade;
drop view if exists sla_actual_agent_month   cascade;

-- Helper functions
drop function if exists my_region_ids()       cascade;
drop function if exists my_area_ids()         cascade;
drop function if exists is_global()           cascade;
drop function if exists app_role()            cascade;

-- Tables (reverse dependency order)
drop table if exists sla_target      cascade;
drop table if exists sales_fact      cascade;
drop table if exists raw_import_row  cascade;
drop table if exists import_batch    cascade;
drop table if exists user_scope      cascade;
drop table if exists profile         cascade;
drop table if exists agent           cascade;
drop table if exists channel         cascade;
drop table if exists branch          cascade;
drop table if exists area            cascade;
drop table if exists city            cascade;
drop table if exists region          cascade;
drop table if exists country         cascade;
drop table if exists company         cascade;

-- Enums last
drop type if exists import_status cascade;
drop type if exists agent_type    cascade;
drop type if exists app_role      cascade;
drop type if exists org_level     cascade;
