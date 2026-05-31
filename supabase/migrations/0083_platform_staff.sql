-- ============================================================================
-- 0083: Platform internal staff — roles, granular permissions, offboarding.
-- ----------------------------------------------------------------------------
-- Vendor-side (NOT tenant) capability: internal employees of the platform with
-- granular permissions, distinct from company users. Generic and platform-wide;
-- no business-type or tenant coupling. Additive only — no existing table or
-- policy is modified here (cross-tenant policy widening is a later migration).
--
-- Model:
--   erp_platform_role_permissions   role -> permission default grants (owner-editable)
--   erp_platform_staff              the employee (vendor-wide; NO company_id)
--   erp_platform_staff_permissions  per-employee grant/deny overrides
-- Effective permission = owner ? ALL : (role defaults ∪ grants) − denies.
--
-- Guarantees:
--   * Platform Owner (erp_profiles.is_platform_owner) keeps ultimate control;
--     ownership stays owner-only via the existing erp_guard_profile_privileges
--     trigger (this feature never sets is_platform_owner, and 'owner' is not a
--     staff role) → manage_users can never create an Owner.
--   * manage_users can manage staff but a trigger forbids assigning a role /
--     granting an override that confers a permission the actor lacks.
--   * All permission changes are audit-logged at the DB level (triggers).
--   * No infrastructure secret is stored here (or anywhere in the app DB).
-- ============================================================================

-- Role -> permission default grants. Role & permission keys are validated in
-- app code (src/lib/erp/platform-permissions.ts); stored as text. Owner-editable.
create table if not exists erp_platform_role_permissions (
  role        text not null,
  permission  text not null,
  primary key (role, permission)
);

-- Internal employees. Vendor-wide — deliberately NO company_id.
create table if not exists erp_platform_staff (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null unique references erp_profiles(id) on delete cascade,
  role         text not null,
  title        text,
  is_active    boolean not null default true,
  created_by   uuid references erp_profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  disabled_at  timestamptz,
  disabled_by  uuid references erp_profiles(id) on delete set null
);
create index if not exists idx_platform_staff_active on erp_platform_staff(is_active);

-- Per-employee overrides on top of role defaults.
create table if not exists erp_platform_staff_permissions (
  staff_id    uuid not null references erp_platform_staff(id) on delete cascade,
  permission  text not null,
  effect      text not null check (effect in ('grant','deny')),
  primary key (staff_id, permission)
);

-- ── Resolution helpers (SECURITY DEFINER; search_path pinned; anon revoked) ──

-- Active staff role for the current user (or null).
create or replace function erp_platform_staff_role()
returns text language sql stable security definer
set search_path to 'public','pg_temp' as $$
  select role from erp_platform_staff where profile_id = auth.uid() and is_active;
$$;

-- Owner OR an active internal employee.
create or replace function erp_is_platform_staff()
returns boolean language sql stable security definer
set search_path to 'public','pg_temp' as $$
  select coalesce((select is_platform_owner from erp_profiles where id = auth.uid()), false)
      or exists (select 1 from erp_platform_staff where profile_id = auth.uid() and is_active);
$$;

-- Effective permission check used by RLS + app gates.
create or replace function erp_platform_has(p_perm text)
returns boolean language sql stable security definer
set search_path to 'public','pg_temp' as $$
  select
    coalesce((select is_platform_owner from erp_profiles where id = auth.uid()), false)
    or exists (
      select 1 from erp_platform_staff s
      where s.profile_id = auth.uid() and s.is_active
        and (
          exists (select 1 from erp_platform_staff_permissions o
                   where o.staff_id = s.id and o.permission = p_perm and o.effect = 'grant')
          or (
            exists (select 1 from erp_platform_role_permissions rp
                    where rp.role = s.role and rp.permission = p_perm)
            and not exists (select 1 from erp_platform_staff_permissions o
                            where o.staff_id = s.id and o.permission = p_perm and o.effect = 'deny')
          )
        )
    );
$$;

-- Effective permission set for the current user. Returns array['*'] for the
-- owner (app expands to the full catalog); otherwise (role defaults ∪ grants)
-- − denies. Called by the app resolver via RPC.
create or replace function erp_platform_my_permissions()
returns text[] language plpgsql stable security definer
set search_path to 'public','pg_temp' as $$
declare
  v_owner boolean := coalesce((select is_platform_owner from erp_profiles where id = auth.uid()), false);
  v_id    uuid;
  v_role  text;
  v_perms text[];
begin
  if v_owner then return array['*']; end if;
  select id, role into v_id, v_role from erp_platform_staff where profile_id = auth.uid() and is_active;
  if v_id is null then return array[]::text[]; end if;
  select coalesce(array_agg(distinct perm), '{}') into v_perms from (
    select rp.permission as perm
      from erp_platform_role_permissions rp
     where rp.role = v_role
       and not exists (select 1 from erp_platform_staff_permissions o
                       where o.staff_id = v_id and o.permission = rp.permission and o.effect = 'deny')
    union
    select o.permission
      from erp_platform_staff_permissions o
     where o.staff_id = v_id and o.effect = 'grant'
  ) x;
  return v_perms;
end; $$;

revoke all on function erp_platform_staff_role() from public, anon;
revoke all on function erp_is_platform_staff() from public, anon;
revoke all on function erp_platform_has(text) from public, anon;
revoke all on function erp_platform_my_permissions() from public, anon;
grant execute on function erp_platform_staff_role() to authenticated;
grant execute on function erp_is_platform_staff() to authenticated;
grant execute on function erp_platform_has(text) to authenticated;
grant execute on function erp_platform_my_permissions() to authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table erp_platform_role_permissions enable row level security;
alter table erp_platform_staff             enable row level security;
alter table erp_platform_staff_permissions enable row level security;

-- role->permission map: any platform staff may read; only the OWNER may change
-- it (editing what a role can do is an ownership control → no self-escalation).
drop policy if exists erp_prp_read on erp_platform_role_permissions;
create policy erp_prp_read on erp_platform_role_permissions
  for select using ((select erp_is_platform_staff()));
drop policy if exists erp_prp_write on erp_platform_role_permissions;
create policy erp_prp_write on erp_platform_role_permissions
  for all using ((select erp_is_platform_owner())) with check ((select erp_is_platform_owner()));

-- staff: read = owner / self / manage_users. write = owner / manage_users
-- (the escalation trigger bounds what manage_users can do). delete = owner only
-- (offboarding is a deactivate, not a delete).
drop policy if exists erp_pstaff_read on erp_platform_staff;
create policy erp_pstaff_read on erp_platform_staff
  for select using (
    (select erp_is_platform_owner()) or profile_id = auth.uid() or (select erp_platform_has('manage_users'))
  );
drop policy if exists erp_pstaff_ins on erp_platform_staff;
create policy erp_pstaff_ins on erp_platform_staff
  for insert with check ((select erp_is_platform_owner()) or (select erp_platform_has('manage_users')));
drop policy if exists erp_pstaff_upd on erp_platform_staff;
create policy erp_pstaff_upd on erp_platform_staff
  for update using ((select erp_is_platform_owner()) or (select erp_platform_has('manage_users')))
           with check ((select erp_is_platform_owner()) or (select erp_platform_has('manage_users')));
drop policy if exists erp_pstaff_del on erp_platform_staff;
create policy erp_pstaff_del on erp_platform_staff
  for delete using ((select erp_is_platform_owner()));

-- overrides: read = owner / manage_users / the staff themselves; write = owner /
-- manage_users (trigger forbids granting a permission the actor lacks).
drop policy if exists erp_psp_read on erp_platform_staff_permissions;
create policy erp_psp_read on erp_platform_staff_permissions
  for select using (
    (select erp_is_platform_owner())
    or (select erp_platform_has('manage_users'))
    or exists (select 1 from erp_platform_staff s where s.id = staff_id and s.profile_id = auth.uid())
  );
drop policy if exists erp_psp_write on erp_platform_staff_permissions;
create policy erp_psp_write on erp_platform_staff_permissions
  for all using ((select erp_is_platform_owner()) or (select erp_platform_has('manage_users')))
          with check ((select erp_is_platform_owner()) or (select erp_platform_has('manage_users')));

-- ── Escalation guards (defence in depth, independent of RLS wording) ─────────

-- Non-owner actors may not assign a role that confers a permission they lack.
create or replace function erp_platform_staff_guard()
returns trigger language plpgsql security definer
set search_path to 'public','pg_temp' as $$
begin
  if tg_op = 'INSERT' and new.created_by is null then new.created_by := auth.uid(); end if;
  if not (select erp_is_platform_owner()) then
    if exists (
      select 1 from erp_platform_role_permissions rp
      where rp.role = new.role and not (select erp_platform_has(rp.permission))
    ) then
      raise exception 'cannot assign a role with permissions you do not have';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists erp_platform_staff_guard_t on erp_platform_staff;
create trigger erp_platform_staff_guard_t
  before insert or update on erp_platform_staff
  for each row execute function erp_platform_staff_guard();

-- Non-owner actors may not GRANT a permission they do not themselves have.
create or replace function erp_platform_staff_perm_guard()
returns trigger language plpgsql security definer
set search_path to 'public','pg_temp' as $$
begin
  if not (select erp_is_platform_owner()) then
    if new.effect = 'grant' and not (select erp_platform_has(new.permission)) then
      raise exception 'cannot grant a permission you do not have';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists erp_platform_staff_perm_guard_t on erp_platform_staff_permissions;
create trigger erp_platform_staff_perm_guard_t
  before insert or update on erp_platform_staff_permissions
  for each row execute function erp_platform_staff_perm_guard();

-- ── Audit: every permission/staff change is logged via erp_log_audit() ───────
create or replace function erp_platform_staff_audit()
returns trigger language plpgsql security definer
set search_path to 'public','pg_temp' as $$
begin
  perform erp_log_audit(lower(tg_op) || '_platform_staff', 'platform_staff',
    coalesce(new.id, old.id)::text,
    jsonb_build_object('role', coalesce(new.role, old.role),
                       'is_active', coalesce(new.is_active, old.is_active)), null);
  return coalesce(new, old);
end; $$;
drop trigger if exists erp_platform_staff_audit_t on erp_platform_staff;
create trigger erp_platform_staff_audit_t
  after insert or update or delete on erp_platform_staff
  for each row execute function erp_platform_staff_audit();

create or replace function erp_platform_perm_audit()
returns trigger language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare v_staff uuid := coalesce(new.staff_id, old.staff_id);
begin
  perform erp_log_audit(lower(tg_op) || '_platform_staff_permission', 'platform_staff_permission',
    v_staff::text,
    jsonb_build_object('permission', coalesce(new.permission, old.permission),
                       'effect', coalesce(new.effect, old.effect)), null);
  return coalesce(new, old);
end; $$;
drop trigger if exists erp_platform_perm_audit_t on erp_platform_staff_permissions;
create trigger erp_platform_perm_audit_t
  after insert or update or delete on erp_platform_staff_permissions
  for each row execute function erp_platform_perm_audit();

create or replace function erp_platform_role_perm_audit()
returns trigger language plpgsql security definer
set search_path to 'public','pg_temp' as $$
begin
  perform erp_log_audit(lower(tg_op) || '_platform_role_permission', 'platform_role_permission',
    coalesce(new.role, old.role),
    jsonb_build_object('permission', coalesce(new.permission, old.permission)), null);
  return coalesce(new, old);
end; $$;
drop trigger if exists erp_platform_role_perm_audit_t on erp_platform_role_permissions;
create trigger erp_platform_role_perm_audit_t
  after insert or update or delete on erp_platform_role_permissions
  for each row execute function erp_platform_role_perm_audit();

-- ── Seed default role -> permission grants (approved matrix; owner is implicit
-- ALL, so it is not seeded here). Idempotent. ───────────────────────────────
insert into erp_platform_role_permissions (role, permission) values
  ('admin','view_companies'),('admin','create_companies'),('admin','manage_billing'),
  ('admin','export_data'),('admin','manage_users'),('admin','access_support_tickets'),('admin','access_audit_logs'),
  ('sales','view_companies'),('sales','create_companies'),
  ('support','view_companies'),('support','access_support_tickets'),
  ('implementation','view_companies'),('implementation','create_companies'),
  ('implementation','export_data'),('implementation','access_support_tickets'),
  ('finance','view_companies'),('finance','manage_billing'),('finance','export_data'),('finance','access_audit_logs')
on conflict (role, permission) do nothing;
