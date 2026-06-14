-- ============================================================================
-- 0301: Approval engine — erp_workflow_my_tasks() (P3 unified-inbox foundation)
-- ----------------------------------------------------------------------------
-- ADDITIVE + DORMANT. A NEW read function returning the PENDING workflow tasks
-- the caller is authorised to act on, pushing the company_admin/user/role/
-- permission predicate INTO SQL (via erp_workflow_user_can_act) instead of the
-- current in-memory 2000-row scan in /approvals. This is the scalability
-- foundation for the unified inbox (P3); the page can adopt it behind a flag.
-- Nothing consumes it yet, so there is no behavioural change. SECURITY DEFINER
-- with auth.uid()-based filtering keeps it tenant-safe (a user only sees tasks
-- they can act on, in companies where they hold the role/permission).
--
-- Rollback: drop function erp_workflow_my_tasks();  (no data affected)
-- ============================================================================
create or replace function erp_workflow_my_tasks()
returns setof erp_workflow_tasks language sql stable security definer
set search_path to 'public','pg_temp' as $$
  select t.*
    from erp_workflow_tasks t
    join erp_workflow_instances i on i.id = t.instance_id and i.status = 'pending'
   where t.status = 'pending'
     and erp_workflow_user_can_act(i.company_id, t.assignee_type, t.assignee_ref);
$$;

revoke all on function erp_workflow_my_tasks() from public, anon;
grant execute on function erp_workflow_my_tasks() to authenticated;
