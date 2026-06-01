-- ============================================================================
-- 0104: M4(a) — Billing & Subscription change requests (platform-scope workflow)
-- ----------------------------------------------------------------------------
-- The first request type on the platform-scope engine. A tenant admin raises a
-- subscription change; it routes to platform Billing review (platform_staff
-- with manage_billing) then platform Owner approval. On approval the outcome
-- handler calls the CANONICAL subscription service. Because the final step is
-- platform_owner, the outcome runs as the owner — so the existing owner-guarded
-- subscription RPCs need NO change. Additive + idempotent.
-- ============================================================================

-- ── Typed request payload (the "heavy" domain) ──────────────────────────────
create table if not exists erp_subscription_change_requests (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references erp_companies(id) on delete cascade,
  requested_by uuid references erp_profiles(id) on delete set null,
  kind         text not null check (kind in ('plan','trial','renew','suspend','reactivate','cancel')),
  plan_key     text,
  trial_days   integer,
  end_date     date,
  note         text,
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at   timestamptz not null default now()
);
create index if not exists idx_subchg_company on erp_subscription_change_requests(company_id, created_at desc);

alter table erp_subscription_change_requests enable row level security;

-- Read: platform owner (all) or the subject company's members (so the requester
-- tracks status). Insert: company admin of their own company. Update: platform
-- owner only (the approving owner stamps the final status via the handler).
drop policy if exists erp_subchg_read on erp_subscription_change_requests;
create policy erp_subchg_read on erp_subscription_change_requests for select
  using ((select erp_is_platform_owner()) or company_id = (select erp_user_company_id()));
drop policy if exists erp_subchg_insert on erp_subscription_change_requests;
create policy erp_subchg_insert on erp_subscription_change_requests for insert
  with check (company_id = (select erp_user_company_id()) and (select erp_is_company_admin(company_id)));
drop policy if exists erp_subchg_update on erp_subscription_change_requests;
create policy erp_subchg_update on erp_subscription_change_requests for update
  using ((select erp_is_platform_owner())) with check ((select erp_is_platform_owner()));

-- ── Seed the global platform-scope workflow definition ──────────────────────
insert into erp_workflow_definitions(company_id, key, entity, name_ar, name_en, scope, category)
values (null, 'subscription_change', 'subscription_change', 'تغيير الاشتراك', 'Subscription change', 'platform', 'billing')
on conflict do nothing;

insert into erp_workflow_steps(definition_id, step_no, name_ar, name_en, approver_type, approver_ref, mode, required_approvals, condition)
select id, 1, 'مراجعة الفوترة', 'Billing review', 'platform_staff', 'manage_billing', 'sequential', 1, null
  from erp_workflow_definitions where key='subscription_change' and entity='subscription_change' and company_id is null
on conflict (definition_id, step_no) do nothing;

insert into erp_workflow_steps(definition_id, step_no, name_ar, name_en, approver_type, approver_ref, mode, required_approvals, condition)
select id, 2, 'اعتماد المالك', 'Owner approval', 'platform_owner', null, 'sequential', 1, null
  from erp_workflow_definitions where key='subscription_change' and entity='subscription_change' and company_id is null
on conflict (definition_id, step_no) do nothing;

-- ============================================================================
-- ROLLBACK (manual): delete the seeded definition/steps (by key) and
-- drop table erp_subscription_change_requests. No other data changes.
-- ============================================================================
