-- 0073_consolidate_permissive_policies.sql
-- Performance: finish the `multiple_permissive_policies` advisor by collapsing
-- the remaining overlaps so every (table, command) has exactly one permissive
-- policy. Access semantics are preserved exactly — multiple ALL policies are
-- OR-merged, and FOR ALL write policies that overlapped a broader SELECT policy
-- are split into per-command (INSERT/UPDATE/DELETE) policies. Helper calls are
-- wrapped in (select …) for the initplan optimization.

-- ── Pattern B: merge the manage/platform/superadmin ALL policies ───────────

-- erp_branches: branch member OR platform owner OR super admin.
drop policy if exists erp_branches_manage on erp_branches;
drop policy if exists erp_branches_platform on erp_branches;
drop policy if exists erp_branches_superadmin on erp_branches;
create policy erp_branches_access on erp_branches for all
  using ((id = any ((select erp_user_branch_ids())::uuid[])) or (select erp_is_platform_owner()) or (select erp_is_super_admin()))
  with check ((id = any ((select erp_user_branch_ids())::uuid[])) or (select erp_is_platform_owner()) or (select erp_is_super_admin()));

-- erp_companies: own company (via branches) OR platform owner OR super admin.
drop policy if exists erp_companies_manage on erp_companies;
drop policy if exists erp_companies_platform on erp_companies;
drop policy if exists erp_companies_superadmin on erp_companies;
create policy erp_companies_access on erp_companies for all
  using ((id in (select b.company_id from erp_branches b where b.id = any ((select erp_user_branch_ids())::uuid[]))) or (select erp_is_platform_owner()) or (select erp_is_super_admin()))
  with check ((id in (select b.company_id from erp_branches b where b.id = any ((select erp_user_branch_ids())::uuid[]))) or (select erp_is_platform_owner()) or (select erp_is_super_admin()));

-- erp_user_branches: read is broader (own row) than write (branch admin / super
-- admin), so split into one SELECT + per-command writes.
drop policy if exists erp_user_branches_manage on erp_user_branches;
drop policy if exists erp_user_branches_superadmin on erp_user_branches;
drop policy if exists erp_user_branches_select on erp_user_branches;
create policy erp_user_branches_select on erp_user_branches for select
  using ((user_id = (select auth.uid())) or (branch_id = any ((select erp_user_branch_ids())::uuid[])) or (select erp_is_super_admin()));
create policy erp_user_branches_insert on erp_user_branches for insert
  with check ((branch_id = any ((select erp_user_branch_ids())::uuid[])) or (select erp_is_super_admin()));
create policy erp_user_branches_update on erp_user_branches for update
  using ((branch_id = any ((select erp_user_branch_ids())::uuid[])) or (select erp_is_super_admin()))
  with check ((branch_id = any ((select erp_user_branch_ids())::uuid[])) or (select erp_is_super_admin()));
create policy erp_user_branches_delete on erp_user_branches for delete
  using ((branch_id = any ((select erp_user_branch_ids())::uuid[])) or (select erp_is_super_admin()));

-- erp_profiles: keep the (broad) SELECT policy; merge super-admin ALL with
-- update-self into one UPDATE, and split INSERT/DELETE to super admin.
drop policy if exists erp_profiles_admin_manage on erp_profiles;
drop policy if exists erp_profiles_update_self on erp_profiles;
create policy erp_profiles_update on erp_profiles for update
  using ((id = (select auth.uid())) or (select erp_is_super_admin()))
  with check ((id = (select auth.uid())) or (select erp_is_super_admin()));
create policy erp_profiles_insert on erp_profiles for insert
  with check ((select erp_is_super_admin()));
create policy erp_profiles_delete on erp_profiles for delete
  using ((select erp_is_super_admin()));

-- ── Pattern C: reference/config tables — keep the SELECT (_read) policy as the
-- single reader; convert the owner/admin FOR ALL policy to per-command writes.

-- Global reference, written by the platform owner.
drop policy if exists erp_btm_owner on erp_business_type_modules;
create policy erp_btm_ins on erp_business_type_modules for insert with check ((select erp_is_platform_owner()));
create policy erp_btm_upd on erp_business_type_modules for update using ((select erp_is_platform_owner())) with check ((select erp_is_platform_owner()));
create policy erp_btm_del on erp_business_type_modules for delete using ((select erp_is_platform_owner()));

drop policy if exists erp_business_type_roles_owner on erp_business_type_roles;
create policy erp_btr_ins on erp_business_type_roles for insert with check ((select erp_is_platform_owner()));
create policy erp_btr_upd on erp_business_type_roles for update using ((select erp_is_platform_owner())) with check ((select erp_is_platform_owner()));
create policy erp_btr_del on erp_business_type_roles for delete using ((select erp_is_platform_owner()));

drop policy if exists erp_plan_modules_owner on erp_plan_modules;
create policy erp_plan_modules_ins on erp_plan_modules for insert with check ((select erp_is_platform_owner()));
create policy erp_plan_modules_upd on erp_plan_modules for update using ((select erp_is_platform_owner())) with check ((select erp_is_platform_owner()));
create policy erp_plan_modules_del on erp_plan_modules for delete using ((select erp_is_platform_owner()));

drop policy if exists erp_plans_owner on erp_plans;
create policy erp_plans_ins on erp_plans for insert with check ((select erp_is_platform_owner()));
create policy erp_plans_upd on erp_plans for update using ((select erp_is_platform_owner())) with check ((select erp_is_platform_owner()));
create policy erp_plans_del on erp_plans for delete using ((select erp_is_platform_owner()));

-- Global reference, written by a super admin.
drop policy if exists erp_roles_admin on erp_roles;
create policy erp_roles_ins on erp_roles for insert with check ((select erp_is_super_admin()));
create policy erp_roles_upd on erp_roles for update using ((select erp_is_super_admin())) with check ((select erp_is_super_admin()));
create policy erp_roles_del on erp_roles for delete using ((select erp_is_super_admin()));

drop policy if exists erp_role_permissions_admin on erp_role_permissions;
create policy erp_role_permissions_ins on erp_role_permissions for insert with check ((select erp_is_super_admin()));
create policy erp_role_permissions_upd on erp_role_permissions for update using ((select erp_is_super_admin())) with check ((select erp_is_super_admin()));
create policy erp_role_permissions_del on erp_role_permissions for delete using ((select erp_is_super_admin()));

-- Company-scoped config, written by the platform owner; readers are the owner
-- or the owning company. Recreate the read wrapped, then per-command writes.
drop policy if exists erp_company_modules_owner on erp_company_modules;
drop policy if exists erp_company_modules_read on erp_company_modules;
create policy erp_company_modules_read on erp_company_modules for select
  using ((select erp_is_platform_owner()) or (company_id = (select erp_user_company_id())));
create policy erp_company_modules_ins on erp_company_modules for insert with check ((select erp_is_platform_owner()));
create policy erp_company_modules_upd on erp_company_modules for update using ((select erp_is_platform_owner())) with check ((select erp_is_platform_owner()));
create policy erp_company_modules_del on erp_company_modules for delete using ((select erp_is_platform_owner()));

drop policy if exists erp_company_roles_owner on erp_company_roles;
drop policy if exists erp_company_roles_read on erp_company_roles;
create policy erp_company_roles_read on erp_company_roles for select
  using ((select erp_is_platform_owner()) or (company_id = (select erp_user_company_id())));
create policy erp_company_roles_ins on erp_company_roles for insert with check ((select erp_is_platform_owner()));
create policy erp_company_roles_upd on erp_company_roles for update using ((select erp_is_platform_owner())) with check ((select erp_is_platform_owner()));
create policy erp_company_roles_del on erp_company_roles for delete using ((select erp_is_platform_owner()));

drop policy if exists erp_company_role_permissions_owner on erp_company_role_permissions;
drop policy if exists erp_company_role_permissions_read on erp_company_role_permissions;
create policy erp_company_role_permissions_read on erp_company_role_permissions for select
  using ((select erp_is_platform_owner()) or (company_id = (select erp_user_company_id())));
create policy erp_company_role_permissions_ins on erp_company_role_permissions for insert with check ((select erp_is_platform_owner()));
create policy erp_company_role_permissions_upd on erp_company_role_permissions for update using ((select erp_is_platform_owner())) with check ((select erp_is_platform_owner()));
create policy erp_company_role_permissions_del on erp_company_role_permissions for delete using ((select erp_is_platform_owner()));
