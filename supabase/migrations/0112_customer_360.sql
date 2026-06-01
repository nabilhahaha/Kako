-- ============================================================================
-- 0112: Platform Foundation #5 — Customer 360
-- ----------------------------------------------------------------------------
-- A platform-level, read-only profile that COMPOSES a customer's data from all
-- foundations (master, ownership, workflow, audit, attachments, raw-data
-- analytics). Future modules ENRICH it by writing raw facts / their own data —
-- the function reads them without redesign. Multi-tenant + permission-aware
-- (company scope + customers:view via the Permission Matrix, or company admin /
-- owner). Additive; no existing behaviour changes.
-- ============================================================================

create or replace function erp_customer_360(p_customer uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'public','pg_temp' as $$
declare
  c erp_customers; v_company uuid; v_acct uuid; v_route_rep uuid; v_sup uuid; v_mgr uuid; v_result jsonb;
begin
  select * into c from erp_customers where id = p_customer;
  if c.id is null then return null; end if;
  v_company := c.company_id;

  -- tenant isolation + permission-aware access
  if not (
    (select erp_is_platform_owner())
    or (v_company = (select erp_user_company_id())
        and ((select erp_matrix_has('customers','view')) or (select erp_is_company_admin(v_company))))
  ) then
    raise exception 'forbidden';
  end if;

  v_acct := c.salesman_id;
  select rep_id into v_route_rep from erp_routes where id = c.route_id and company_id = v_company;
  select ub.reports_to into v_sup
    from erp_user_branches ub join erp_branches b on b.id = ub.branch_id
   where ub.user_id = coalesce(v_acct, v_route_rep) and b.company_id = v_company and ub.reports_to is not null
   limit 1;
  select ub.reports_to into v_mgr
    from erp_user_branches ub join erp_branches b on b.id = ub.branch_id
   where ub.user_id = v_sup and b.company_id = v_company and ub.reports_to is not null
   limit 1;

  select jsonb_build_object(
    'master', jsonb_build_object(
      'id', c.id, 'code', c.code, 'name', coalesce(c.name_ar, c.name), 'name_en', c.name,
      'phone', c.phone, 'credit_limit', c.credit_limit,
      'status', case when c.is_approved then 'active' else 'pending' end,
      'classification', null,                         -- enrichable by future modules
      'route', (select name from erp_routes where id = c.route_id),
      'branch', (select coalesce(name_ar, name) from erp_branches where id = c.branch_id),
      'region', null, 'area', null
    ),
    'ownership', jsonb_build_object(
      'account_owner', (select jsonb_build_object('id', id, 'name', full_name, 'email', email) from erp_profiles where id = v_acct),
      'route_owner',   (select jsonb_build_object('id', id, 'name', full_name, 'email', email) from erp_profiles where id = v_route_rep),
      'supervisor',    (select jsonb_build_object('id', id, 'name', full_name) from erp_profiles where id = v_sup),
      'manager',       (select jsonb_build_object('id', id, 'name', full_name) from erp_profiles where id = v_mgr)
    ),
    'workflow', jsonb_build_object(
      'open_requests', (select count(*) from erp_workflow_instances
                         where company_id = v_company and status = 'pending'
                           and entity = 'customer' and record_id = c.id::text),
      'pending_approvals', (select count(*) from erp_workflow_tasks t
                             join erp_workflow_instances i on i.id = t.instance_id
                            where i.company_id = v_company and i.entity = 'customer'
                              and i.record_id = c.id::text and t.status = 'pending'),
      'recent_activities', coalesce((
        select jsonb_agg(jsonb_build_object('event', ev.event, 'at', ev.created_at))
        from (select e.event, e.created_at from erp_workflow_events e
               join erp_workflow_instances i on i.id = e.instance_id
              where i.entity = 'customer' and i.record_id = c.id::text
              order by e.created_at desc limit 10) ev), '[]'::jsonb)
    ),
    'audit', jsonb_build_object(
      'recent_changes', coalesce((
        select jsonb_agg(jsonb_build_object('action', a.action, 'changed', a.change_set, 'by', a.actor_email, 'at', a.created_at))
        from (select action, change_set, actor_email, created_at from erp_audit_logs
               where entity = 'customers' and entity_id = c.id::text
               order by created_at desc limit 10) a), '[]'::jsonb),
      'last_modified_by', (select actor_email from erp_audit_logs where entity = 'customers' and entity_id = c.id::text order by created_at desc limit 1),
      'last_modified_at', (select created_at from erp_audit_logs where entity = 'customers' and entity_id = c.id::text order by created_at desc limit 1)
    ),
    'attachments', (
      select jsonb_build_object(
        'total', count(*),
        'images', count(*) filter (where mime_type like 'image/%'),
        'documents', count(*) filter (where mime_type is null or mime_type not like 'image/%'),
        'certifications', count(*) filter (where lower(file_name) like '%cert%'),
        'items', coalesce(jsonb_agg(jsonb_build_object('name', file_name, 'type', mime_type, 'by', uploaded_by, 'at', created_at) order by created_at desc), '[]'::jsonb)
      ) from erp_entity_attachments
       where company_id = v_company and entity in ('customer','customers') and record_id = c.id::text
    ),
    'analytics', coalesce((
      select jsonb_agg(jsonb_build_object('module', module, 'events', cnt, 'amount', amt, 'quantity', qty, 'gross_profit', gp))
      from (select module, count(*) cnt, sum(amount) amt, sum(quantity) qty, sum(gross_profit) gp
            from erp_raw_facts where company_id = v_company and customer_id = c.id group by module) m
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end; $$;

revoke all on function erp_customer_360(uuid) from public, anon;
grant execute on function erp_customer_360(uuid) to authenticated;

-- ============================================================================
-- ROLLBACK (manual): drop function erp_customer_360(uuid). No data touched.
-- ============================================================================
