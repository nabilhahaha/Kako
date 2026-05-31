-- ── Phase 2: Organization structure ───────────────────────────────────────
-- Departments, Teams, Job titles + employee assignment & reporting lines.
-- All company-scoped, RLS enforced. Reads: any member of the company. Writes:
-- the company admin (branch role 'admin'). Additive & idempotent.

-- Helper: is the current user an admin of the given company?
create or replace function erp_is_company_admin(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $$
  select exists(
    select 1 from erp_user_branches ub
    join erp_branches b on b.id = ub.branch_id
    where ub.user_id = auth.uid() and b.company_id = p_company and ub.role = 'admin'
  );
$$;
revoke all on function erp_is_company_admin(uuid) from public, anon;
grant execute on function erp_is_company_admin(uuid) to authenticated;

-- ── Departments ────────────────────────────────────────────────────────────
create table if not exists erp_departments (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references erp_companies(id) on delete cascade,
  branch_id   uuid references erp_branches(id) on delete set null,
  name        text not null,
  name_ar     text,
  manager_id  uuid references erp_profiles(id) on delete set null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_departments_company on erp_departments(company_id);

-- ── Teams (belong to a department) ──────────────────────────────────────────
create table if not exists erp_teams (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references erp_companies(id) on delete cascade,
  department_id uuid references erp_departments(id) on delete set null,
  name          text not null,
  name_ar       text,
  lead_id       uuid references erp_profiles(id) on delete set null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_teams_company on erp_teams(company_id);
create index if not exists idx_teams_department on erp_teams(department_id);

-- ── Job titles ──────────────────────────────────────────────────────────────
create table if not exists erp_job_titles (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references erp_companies(id) on delete cascade,
  name        text not null,
  name_ar     text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_job_titles_company on erp_job_titles(company_id);

-- ── Employee assignment on the membership row ───────────────────────────────
-- reports_to already exists; add department / team / job title links.
alter table erp_user_branches
  add column if not exists department_id uuid references erp_departments(id) on delete set null,
  add column if not exists team_id       uuid references erp_teams(id)       on delete set null,
  add column if not exists job_title_id  uuid references erp_job_titles(id)  on delete set null;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table erp_departments enable row level security;
alter table erp_teams       enable row level security;
alter table erp_job_titles  enable row level security;

-- Departments
drop policy if exists erp_departments_read on erp_departments;
create policy erp_departments_read on erp_departments
  for select using (
    (select erp_is_platform_owner()) or company_id = (select erp_user_company_id())
  );
drop policy if exists erp_departments_write on erp_departments;
create policy erp_departments_write on erp_departments
  for all using (
    (select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))
  ) with check (
    (select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))
  );

-- Teams
drop policy if exists erp_teams_read on erp_teams;
create policy erp_teams_read on erp_teams
  for select using (
    (select erp_is_platform_owner()) or company_id = (select erp_user_company_id())
  );
drop policy if exists erp_teams_write on erp_teams;
create policy erp_teams_write on erp_teams
  for all using (
    (select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))
  ) with check (
    (select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))
  );

-- Job titles
drop policy if exists erp_job_titles_read on erp_job_titles;
create policy erp_job_titles_read on erp_job_titles
  for select using (
    (select erp_is_platform_owner()) or company_id = (select erp_user_company_id())
  );
drop policy if exists erp_job_titles_write on erp_job_titles;
create policy erp_job_titles_write on erp_job_titles
  for all using (
    (select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))
  ) with check (
    (select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))
  );

-- Auto-stamp company_id on insert if omitted (mirrors other tenant tables).
create or replace function erp_org_set_company()
returns trigger language plpgsql security definer
set search_path to 'public','pg_temp' as $$
begin
  if new.company_id is null then new.company_id := erp_user_company_id(); end if;
  return new;
end; $$;

drop trigger if exists erp_departments_set_company on erp_departments;
create trigger erp_departments_set_company before insert on erp_departments
  for each row execute function erp_org_set_company();
drop trigger if exists erp_teams_set_company on erp_teams;
create trigger erp_teams_set_company before insert on erp_teams
  for each row execute function erp_org_set_company();
drop trigger if exists erp_job_titles_set_company on erp_job_titles;
create trigger erp_job_titles_set_company before insert on erp_job_titles
  for each row execute function erp_org_set_company();
