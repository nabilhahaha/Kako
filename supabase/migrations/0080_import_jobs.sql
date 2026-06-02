-- Import Engine: job tracking (history + logs). Company-scoped, RLS. Generic by
-- target_entity so it serves every registered entity. See docs/INTEGRATION.md.
create table if not exists erp_import_jobs (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references erp_companies(id) on delete cascade,
  target_entity text not null,
  file_name     text,
  mapping       jsonb not null default '{}'::jsonb,
  status        text not null default 'completed'
                  check (status in ('draft','validating','ready','importing','completed','failed')),
  total_rows    integer not null default 0,
  success_rows  integer not null default 0,
  failed_rows   integer not null default 0,
  error_log     jsonb not null default '[]'::jsonb,
  created_by    uuid references erp_profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);
create index if not exists idx_import_jobs_company on erp_import_jobs(company_id, created_at desc);

alter table erp_import_jobs enable row level security;

drop policy if exists erp_import_jobs_read on erp_import_jobs;
create policy erp_import_jobs_read on erp_import_jobs
  for select using ((select erp_is_platform_owner()) or company_id = (select erp_user_company_id()));
drop policy if exists erp_import_jobs_write on erp_import_jobs;
create policy erp_import_jobs_write on erp_import_jobs
  for all using ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id)))
  with check ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id)));

drop trigger if exists erp_import_jobs_set_company on erp_import_jobs;
create trigger erp_import_jobs_set_company before insert on erp_import_jobs
  for each row execute function erp_org_set_company();
