-- ============================================================================
-- 0105: M4(b) — Onboarding / provisioning requests (platform-scope workflow)
-- ----------------------------------------------------------------------------
-- A company admin requests onboarding/provisioning for their company (plan +
-- optional trial). Routes to platform onboarding review (platform_staff with
-- create_companies) then platform Owner approval. On approval the outcome
-- provisions the tenant via the canonical subscription service and marks setup
-- done. Final step = platform_owner, so the owner-guarded RPCs execute.
-- Additive + idempotent. (Staff-initiated PRE-creation prospect onboarding —
-- which needs a nullable-company start variant — is a documented follow-up.)
-- ============================================================================

create table if not exists erp_onboarding_requests (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references erp_companies(id) on delete cascade,
  requested_by uuid references erp_profiles(id) on delete set null,
  plan_key     text,
  trial_days   integer,
  note         text,
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at   timestamptz not null default now()
);
create index if not exists idx_onboarding_company on erp_onboarding_requests(company_id, created_at desc);

alter table erp_onboarding_requests enable row level security;

drop policy if exists erp_onb_read on erp_onboarding_requests;
create policy erp_onb_read on erp_onboarding_requests for select
  using ((select erp_is_platform_owner()) or company_id = (select erp_user_company_id()));
drop policy if exists erp_onb_insert on erp_onboarding_requests;
create policy erp_onb_insert on erp_onboarding_requests for insert
  with check (company_id = (select erp_user_company_id()) and (select erp_is_company_admin(company_id)));
drop policy if exists erp_onb_update on erp_onboarding_requests;
create policy erp_onb_update on erp_onboarding_requests for update
  using ((select erp_is_platform_owner())) with check ((select erp_is_platform_owner()));

-- ── Seed the global platform-scope onboarding workflow ──────────────────────
insert into erp_workflow_definitions(company_id, key, entity, name_ar, name_en, scope, category)
values (null, 'onboarding', 'onboarding', 'تهيئة الاشتراك', 'Onboarding', 'platform', 'onboarding')
on conflict do nothing;

insert into erp_workflow_steps(definition_id, step_no, name_ar, name_en, approver_type, approver_ref, mode, required_approvals, condition)
select id, 1, 'مراجعة التهيئة', 'Onboarding review', 'platform_staff', 'create_companies', 'sequential', 1, null
  from erp_workflow_definitions where key='onboarding' and entity='onboarding' and company_id is null
on conflict (definition_id, step_no) do nothing;

insert into erp_workflow_steps(definition_id, step_no, name_ar, name_en, approver_type, approver_ref, mode, required_approvals, condition)
select id, 2, 'اعتماد المالك', 'Owner approval', 'platform_owner', null, 'sequential', 1, null
  from erp_workflow_definitions where key='onboarding' and entity='onboarding' and company_id is null
on conflict (definition_id, step_no) do nothing;

-- ============================================================================
-- ROLLBACK (manual): delete the seeded 'onboarding' definition/steps and
-- drop table erp_onboarding_requests.
-- ============================================================================
