-- 0341_onboarding_state.sql
-- Onboarding gap #1: wizard save / resume / continue-later state, per company.
-- Reuse-first: completion also flips the existing erp_companies.setup_done flag.
-- Tenant-isolated (company_id-scoped RLS), consistent with the frozen baseline.
-- No engine change; no scope expansion.

create table if not exists public.erp_onboarding_state (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null unique references public.erp_companies(id) on delete cascade,
  template_key text,
  current_step text,
  step_status  jsonb not null default '{}'::jsonb,   -- { basics:'done', org:'in_progress', tax:'skipped', … }
  draft        jsonb not null default '{}'::jsonb,    -- per-step unsaved values (autosave)
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);

alter table public.erp_onboarding_state enable row level security;

drop policy if exists erp_onboarding_state_rw on public.erp_onboarding_state;
create policy erp_onboarding_state_rw on public.erp_onboarding_state
  for all
  using (erp_is_platform_owner() or company_id = erp_user_company_id())
  with check (erp_is_platform_owner() or company_id = erp_user_company_id());
