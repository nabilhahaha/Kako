-- ============================================================================
-- 0106: M4(c) — Module activation requests (platform-scope workflow)
-- ----------------------------------------------------------------------------
-- A company admin requests enabling a module / industry pack / the integrations
-- capability for their company. Routes to platform review (platform_staff) then
-- platform Owner approval. On approval the outcome enables the module via the
-- same entitlement table the Control Center uses (erp_company_modules). Final
-- step = platform_owner. Additive + idempotent.
-- ============================================================================

create table if not exists erp_module_requests (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references erp_companies(id) on delete cascade,
  requested_by uuid references erp_profiles(id) on delete set null,
  module_key   text not null,
  enable       boolean not null default true,
  note         text,
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at   timestamptz not null default now()
);
create index if not exists idx_module_requests_company on erp_module_requests(company_id, created_at desc);

alter table erp_module_requests enable row level security;

drop policy if exists erp_modreq_read on erp_module_requests;
create policy erp_modreq_read on erp_module_requests for select
  using ((select erp_is_platform_owner()) or company_id = (select erp_user_company_id()));
drop policy if exists erp_modreq_insert on erp_module_requests;
create policy erp_modreq_insert on erp_module_requests for insert
  with check (company_id = (select erp_user_company_id()) and (select erp_is_company_admin(company_id)));
drop policy if exists erp_modreq_update on erp_module_requests;
create policy erp_modreq_update on erp_module_requests for update
  using ((select erp_is_platform_owner())) with check ((select erp_is_platform_owner()));

-- ── Seed the global platform-scope module-activation workflow ───────────────
insert into erp_workflow_definitions(company_id, key, entity, name_ar, name_en, scope, category)
values (null, 'module_request', 'module_request', 'تفعيل وحدة', 'Module activation', 'platform', 'modules')
on conflict do nothing;

insert into erp_workflow_steps(definition_id, step_no, name_ar, name_en, approver_type, approver_ref, mode, required_approvals, condition)
select id, 1, 'مراجعة', 'Review', 'platform_staff', 'view_companies', 'sequential', 1, null
  from erp_workflow_definitions where key='module_request' and entity='module_request' and company_id is null
on conflict (definition_id, step_no) do nothing;

insert into erp_workflow_steps(definition_id, step_no, name_ar, name_en, approver_type, approver_ref, mode, required_approvals, condition)
select id, 2, 'اعتماد المالك', 'Owner approval', 'platform_owner', null, 'sequential', 1, null
  from erp_workflow_definitions where key='module_request' and entity='module_request' and company_id is null
on conflict (definition_id, step_no) do nothing;

-- ============================================================================
-- ROLLBACK (manual): delete the seeded 'module_request' definition/steps and
-- drop table erp_module_requests.
-- ============================================================================
