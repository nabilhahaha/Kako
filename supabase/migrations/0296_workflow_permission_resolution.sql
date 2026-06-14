-- ============================================================================
-- 0296: Approval engine — permission-based approver resolution + governance flags
-- ----------------------------------------------------------------------------
-- Convergence Phase 1 (foundation). ADDITIVE + idempotent + behavior-preserving:
-- no existing workflow definition uses these capabilities yet, so live pilot
-- workflows (credit-limit, onboarding, change-requests — all routed to
-- company_admin) behave identically. This only ENABLES new configurable routing.
--
--  1. approver_type may now be 'permission' (erp_workflow_user_can_act already
--     authorises it; this lets resolve_users fan it out + notify + surface it).
--  2. erp_workflow_resolve_users resolves 'permission' to every user in the
--     company who holds that permission — mirroring erp_user_has_permission
--     EXACTLY (company-scoped grants with global fallback per role), so the set
--     that is fanned-out/notified equals the set authorised to act.
--  3. Two governance flags on a definition (default OFF = current behaviour):
--     block_self_approval, require_reject_reason. Enforcement lands in 0297.
-- ============================================================================

-- 1. Allow approver_type = 'permission' (name-agnostic re-create of the check) ─
do $$
declare v_cname text;
begin
  select c.conname into v_cname
  from pg_constraint c join pg_class t on t.oid = c.conrelid
  where t.relname = 'erp_workflow_steps' and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%approver_type%'
  limit 1;
  if v_cname is not null then
    execute format('alter table erp_workflow_steps drop constraint %I', v_cname);
  end if;
end $$;

alter table erp_workflow_steps
  add constraint erp_workflow_steps_approver_type_check
  check (approver_type in ('company_admin','user','role','manager','department_head','permission'));

-- 2. resolve_users gains a 'permission' branch (superset; existing branches
--    untouched). Mirrors erp_user_has_permission's per-role company/global
--    fallback so fanned-out users == authorised users.
create or replace function erp_workflow_resolve_users(p_company uuid, p_type text, p_ref text)
returns setof uuid language sql stable security definer
set search_path to 'public','pg_temp' as $$
  select p_ref::uuid where p_type = 'user' and p_ref is not null
  union
  select distinct ub.user_id
    from erp_user_branches ub join erp_branches b on b.id = ub.branch_id
   where b.company_id = p_company
     and ( (p_type = 'company_admin' and ub.role = 'admin')
        or (p_type = 'role' and ub.role = p_ref) )
  union
  select distinct ub.user_id
    from erp_user_branches ub join erp_branches b on b.id = ub.branch_id
   where p_type = 'permission' and p_ref is not null and b.company_id = p_company
     and (
       exists (select 1 from erp_company_role_permissions crp
                where crp.company_id = p_company and crp.role_key = ub.role and crp.permission = p_ref)
       or (
         not exists (select 1 from erp_company_role_permissions crp2
                      where crp2.company_id = p_company and crp2.role_key = ub.role)
         and exists (select 1 from erp_role_permissions rp
                      where rp.role_key = ub.role and rp.permission = p_ref)
       )
     );
$$;

-- 3. Governance flags (dormant; enforced in 0297). Default OFF = current behaviour.
alter table erp_workflow_definitions
  add column if not exists block_self_approval  boolean not null default false;
alter table erp_workflow_definitions
  add column if not exists require_reject_reason boolean not null default false;

comment on column erp_workflow_definitions.block_self_approval is
  'When true, the user who started an instance cannot approve it (segregation of duties).';
comment on column erp_workflow_definitions.require_reject_reason is
  'When true, a reject decision must carry a non-empty comment.';
