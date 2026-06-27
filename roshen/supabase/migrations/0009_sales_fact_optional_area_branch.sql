-- =====================================================================
-- Roshen KSA — 0009 sales_fact: optional area/branch
--
-- In the simplified Region → City → Distributor model a distributor may have
-- no branch/area. sales_fact still records region/country (derived from the
-- distributor's city), but area_id / branch_id become OPTIONAL.
--
-- Non-destructive: relaxes NOT NULL only. No data dropped.
-- =====================================================================

alter table sales_fact alter column branch_id drop not null;
alter table sales_fact alter column area_id drop not null;
