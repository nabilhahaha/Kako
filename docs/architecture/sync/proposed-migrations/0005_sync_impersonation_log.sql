-- ============================================================================
-- PROPOSED MIGRATION — REVIEW ONLY. DO NOT APPLY AUTOMATICALLY.
--
-- Impersonation audit trail for offline-order reconciliation (§19). The worker
-- acts AS the originating cashier (auth.uid()) to run the audited money-path RPCs;
-- every minted token is recorded here BEFORE use, so there is a complete,
-- tamper-evident record of who was impersonated, for which order, and when.
--
-- The UNIQUE jti is the replay-detection guard: a token id can be logged at most
-- once. Tokens are 60s-TTL and single-use, so this is defence-in-depth.
-- ============================================================================

create table if not exists public.sync_impersonation_log (
  id                bigserial primary key,
  company_id        uuid not null,
  impersonated_user uuid not null,
  entity            text not null,
  pk                text not null,
  jti               uuid not null,
  purpose           text not null,
  issued_at         timestamptz not null,
  expires_at        timestamptz not null,
  created_at        timestamptz not null default now()
);
create unique index if not exists sync_impersonation_jti_uq on public.sync_impersonation_log (jti);
create index if not exists sync_impersonation_feed_idx
  on public.sync_impersonation_log (company_id, created_at);

-- RLS — tenant read for the security/audit console; worker writes via service role.
alter table public.sync_impersonation_log enable row level security;
create policy sync_impersonation_tenant on public.sync_impersonation_log
  using (company_id = erp_user_company_id());
