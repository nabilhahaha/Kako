-- 0336_treasury_perm_and_settlement_sod.sql
-- Cashier/Treasury governance from the Cashier/Treasury review:
--   C-2 Settlement ownership (SoD): remove day.close.settle from SUPERVISOR.
--       Settlement stays with Cashier / Accountant / Admin (and branch_manager,
--       which is intentionally left unchanged here — flagged for separate review).
--   C-1 Treasury exposure: introduce treasury.manage and grant it to the treasury
--       roles (cashier, accountant, admin, manager). The Cash Box (/cashbox) is
--       re-gated on treasury.manage in code, so neither Sales Rep nor Supervisor
--       (who lack it) can reach the Cash Box — by nav OR direct URL.
--
-- The pilot tenant uses company-scoped role permissions, so these operate on
-- erp_company_role_permissions for the pilot company; global erp_role_permissions
-- is updated too for parity with new/other tenants.

begin;

-- ── C-2: remove settlement from the supervisor ────────────────────────────────
delete from erp_company_role_permissions
where company_id = '612af0bd-973c-4fed-8e76-80cf444ef9e0'
  and role_key = 'supervisor'
  and permission = 'day.close.settle';

delete from erp_role_permissions
where role_key = 'supervisor'
  and permission = 'day.close.settle';

-- ── C-1: grant treasury.manage to the treasury roles ──────────────────────────
-- Pilot company override.
insert into erp_company_role_permissions (company_id, role_key, permission)
select '612af0bd-973c-4fed-8e76-80cf444ef9e0', r, 'treasury.manage'
from (values ('cashier'), ('accountant'), ('admin'), ('manager')) v(r)
where not exists (
  select 1 from erp_company_role_permissions x
  where x.company_id = '612af0bd-973c-4fed-8e76-80cf444ef9e0'
    and x.role_key = v.r and x.permission = 'treasury.manage'
);

-- Global defaults (cashier + accountant; admin/manager resolve via wildcard).
insert into erp_role_permissions (role_key, permission)
select r, 'treasury.manage'
from (values ('cashier'), ('accountant')) v(r)
where not exists (
  select 1 from erp_role_permissions x where x.role_key = v.r and x.permission = 'treasury.manage'
);

commit;
