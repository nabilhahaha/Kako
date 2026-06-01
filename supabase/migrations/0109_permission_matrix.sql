-- ============================================================================
-- 0109: Platform Foundation #2 — Role & Permission Matrix
-- ----------------------------------------------------------------------------
-- Action-typed, module-level permissions (view/create/edit/approve/export/
-- delete) as a DEDICATED, decoupled layer that coexists with the legacy
-- permission keys (no rewrite, no collisions). Keys are `resource:action`.
--   • erp_permission_catalog        — the matrix definition (seeded).
--   • erp_matrix_role_permissions   — grants per role; company_id NULL = global
--                                     default, company rows OVERRIDE per tenant.
--   • erp_matrix_has(resource,action)— resolver (super admin / platform owner /
--                                     company admin = all; else role grant with
--                                     company-override-else-global semantics).
-- Platform & company roles supported via the role dimension; future industry
-- packs add resources to the catalog. Permission changes are audited (capture).
-- Multi-tenant isolation via RLS. Additive + idempotent.
-- ============================================================================

-- ── Catalog (matrix definition) ─────────────────────────────────────────────
create table if not exists erp_permission_catalog (
  key      text primary key,                 -- resource:action
  resource text not null,
  action   text not null check (action in ('view','create','edit','approve','export','delete')),
  module   text,
  name_ar  text,
  name_en  text
);

insert into erp_permission_catalog (key, resource, action, module, name_ar, name_en)
select r.resource || ':' || a.action, r.resource, a.action, r.module,
       r.ar || ' — ' || a.ar, r.en || ' — ' || a.en
from (values
  ('customers','crm','العملاء','Customers'),
  ('products','inventory','المنتجات','Products'),
  ('inventory','inventory','المخزون','Inventory'),
  ('sales','sales','المبيعات','Sales'),
  ('suppliers','purchasing','الموردون','Suppliers'),
  ('purchasing','purchasing','المشتريات','Purchasing'),
  ('accounting','accounting','المحاسبة','Accounting'),
  ('routes','distribution','خطوط السير','Routes'),
  ('requests','workflow','الطلبات','Requests'),
  ('reports','analytics','التقارير','Reports')
) as r(resource, module, ar, en)
join (values
  ('view','عرض','View'),('create','إنشاء','Create'),('edit','تعديل','Edit'),
  ('approve','اعتماد','Approve'),('export','تصدير','Export'),('delete','حذف','Delete')
) as a(action, ar, en) on true
where (r.resource, a.action) in (
  ('customers','view'),('customers','create'),('customers','edit'),('customers','approve'),('customers','export'),('customers','delete'),
  ('products','view'),('products','create'),('products','edit'),('products','export'),('products','delete'),
  ('inventory','view'),('inventory','edit'),('inventory','approve'),('inventory','export'),
  ('sales','view'),('sales','create'),('sales','edit'),('sales','approve'),('sales','export'),('sales','delete'),
  ('suppliers','view'),('suppliers','create'),('suppliers','edit'),('suppliers','export'),('suppliers','delete'),
  ('purchasing','view'),('purchasing','create'),('purchasing','edit'),('purchasing','approve'),('purchasing','export'),
  ('accounting','view'),('accounting','create'),('accounting','export'),
  ('routes','view'),('routes','create'),('routes','edit'),('routes','delete'),
  ('requests','view'),('requests','approve'),
  ('reports','view'),('reports','export')
)
on conflict (key) do nothing;

alter table erp_permission_catalog enable row level security;
drop policy if exists erp_permcat_read on erp_permission_catalog;
create policy erp_permcat_read on erp_permission_catalog for select using ((select auth.uid()) is not null);

-- ── Grants (global defaults + per-company overrides) ────────────────────────
create table if not exists erp_matrix_role_permissions (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid references erp_companies(id) on delete cascade,   -- NULL = global default
  role_key   text not null,
  permission text not null,                                         -- resource:action
  created_at timestamptz not null default now(),
  unique nulls not distinct (company_id, role_key, permission)
);
create index if not exists idx_matrix_perms_lookup on erp_matrix_role_permissions(company_id, role_key);

alter table erp_matrix_role_permissions enable row level security;
-- Read: globals (company_id null) + the caller's own company (needed to resolve
-- nav/permissions); platform owner sees all.
drop policy if exists erp_matrix_perms_read on erp_matrix_role_permissions;
create policy erp_matrix_perms_read on erp_matrix_role_permissions for select using (
  (select erp_is_platform_owner())
  or company_id is null
  or company_id = (select erp_user_company_id())
);
-- Write: company admin manages their own company's overrides; owner manages globals.
drop policy if exists erp_matrix_perms_write on erp_matrix_role_permissions;
create policy erp_matrix_perms_write on erp_matrix_role_permissions for all using (
  (select erp_is_platform_owner())
  or (company_id is not null and (select erp_is_company_admin(company_id)))
) with check (
  (select erp_is_platform_owner())
  or (company_id is not null and (select erp_is_company_admin(company_id)))
);

-- ── Seed global role defaults ───────────────────────────────────────────────
insert into erp_matrix_role_permissions (company_id, role_key, permission)
  select null, 'admin', key from erp_permission_catalog on conflict do nothing;
insert into erp_matrix_role_permissions (company_id, role_key, permission)
  select null, 'manager', key from erp_permission_catalog where action <> 'delete' on conflict do nothing;
insert into erp_matrix_role_permissions (company_id, role_key, permission)
  select null, 'supervisor', key from erp_permission_catalog where action in ('view','approve') on conflict do nothing;
insert into erp_matrix_role_permissions (company_id, role_key, permission)
  select null, 'accountant', key from erp_permission_catalog where resource in ('accounting','reports') on conflict do nothing;
insert into erp_matrix_role_permissions (company_id, role_key, permission)
  select null, 'viewer', key from erp_permission_catalog where action = 'view' on conflict do nothing;
insert into erp_matrix_role_permissions (company_id, role_key, permission) values
  (null,'cashier','customers:view'),(null,'cashier','customers:create'),(null,'cashier','sales:view'),(null,'cashier','sales:create'),
  (null,'salesman','customers:view'),(null,'salesman','customers:create'),(null,'salesman','sales:view'),(null,'salesman','sales:create'),(null,'salesman','routes:view')
on conflict do nothing;

-- ── Resolver: company-override-else-global, with admin/owner short-circuits ──
create or replace function erp_matrix_has(p_resource text, p_action text)
returns boolean language sql stable security definer
set search_path to 'public','pg_temp' as $$
  with me as (select erp_user_company_id() as company, auth.uid() as uid)
  select
    (select erp_is_super_admin()) or (select erp_is_platform_owner())
    or exists (  -- company admin: all
      select 1 from erp_user_branches ub join erp_branches b on b.id = ub.branch_id, me
       where ub.user_id = me.uid and b.company_id = me.company and ub.role = 'admin')
    or exists (  -- role grant: company override if configured, else global default
      select 1 from erp_user_branches ub join erp_branches b on b.id = ub.branch_id, me
       where ub.user_id = me.uid and b.company_id = me.company
         and (
           exists (select 1 from erp_matrix_role_permissions mp
                    where mp.company_id = me.company and mp.role_key = ub.role
                      and mp.permission = p_resource || ':' || p_action)
           or (
             not exists (select 1 from erp_matrix_role_permissions mc
                          where mc.company_id = me.company and mc.role_key = ub.role)
             and exists (select 1 from erp_matrix_role_permissions mg
                          where mg.company_id is null and mg.role_key = ub.role
                            and mg.permission = p_resource || ':' || p_action)
           )
         ));
$$;
revoke all on function erp_matrix_has(text,text) from public, anon;
grant execute on function erp_matrix_has(text,text) to authenticated;

-- ── Audit permission changes (req #9): capture on the matrix + legacy tables ──
do $attach$
declare t text;
begin
  foreach t in array array[
    'erp_matrix_role_permissions','erp_company_role_permissions','erp_company_roles','erp_role_permissions'
  ] loop
    if to_regclass(t) is not null then
      execute format('drop trigger if exists trg_audit_%1$s on %1$s', t);
      execute format('create trigger trg_audit_%1$s after insert or update or delete on %1$s for each row execute function erp_audit_capture()', t);
    end if;
  end loop;
end $attach$;

-- ============================================================================
-- ROLLBACK (manual): drop erp_matrix_has; drop the trg_audit_* triggers on the
-- four permission tables; drop erp_matrix_role_permissions and
-- erp_permission_catalog. No legacy permission data is touched.
-- ============================================================================
