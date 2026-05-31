-- supabase/ci/legacy-base.sql
-- Stubs for the legacy "FieldSync" inventory app whose base tables predate the
-- migrations folder. Migrations 0001–0003 patch these (visit_reasons join,
-- promotions, audit log). Only the columns those migrations touch are stubbed,
-- so the FULL migration chain installs from scratch in CI/tests. This is a test
-- harness file — it is NOT a migration and never runs against production.

create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  supervisor_id uuid,
  user_type     text
);

create table if not exists public.visits (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid
);

create table if not exists public.visit_reasons_master (
  id uuid primary key default gen_random_uuid()
);

create table if not exists public.near_expiry_records (
  id     uuid primary key default gen_random_uuid(),
  status text
);
