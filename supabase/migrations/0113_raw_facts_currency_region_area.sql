-- ============================================================================
-- 0113: P0 readiness — currency + source link on raw facts; Region/Area model
-- ----------------------------------------------------------------------------
-- P0.1: add currency (+ uom, source_table/source_id) to erp_raw_facts so
--       multi-currency aggregates are correct and facts can drill through to
--       their transactional row (idempotent emission).
-- P0.2: model Region/Area as branch attributes (recommended near-term), derived
--       into facts and surfaced in Customer 360.
-- Additive + idempotent; emitter/Customer-360 re-defined to use the new fields.
-- ============================================================================

-- P0.1 — raw fact columns
alter table erp_raw_facts add column if not exists currency     text;
alter table erp_raw_facts add column if not exists uom          text;
alter table erp_raw_facts add column if not exists source_table text;
alter table erp_raw_facts add column if not exists source_id    text;
create index if not exists idx_raw_source on erp_raw_facts(source_table, source_id);

-- P0.2 — Region/Area on branches
alter table erp_branches add column if not exists region text;
alter table erp_branches add column if not exists area   text;

-- ── Re-defined emitter: maps currency/uom/source_*; derives region/area from
--    the branch when not supplied. (Supersedes the 0111 body.) ──────────────
create or replace function erp_raw_emit(p_module text, p_event_type text, p_fact jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare v_id uuid; v_company uuid; v_branch uuid; v_region text; v_area text; f jsonb := coalesce(p_fact,'{}'::jsonb);
begin
  v_company := coalesce(nullif(f->>'company_id','')::uuid, erp_user_company_id());
  v_branch  := nullif(f->>'branch_id','')::uuid;
  v_region  := f->>'region';
  v_area    := f->>'area';
  if (v_region is null or v_area is null) and v_branch is not null then
    select coalesce(v_region, region), coalesce(v_area, area) into v_region, v_area
      from erp_branches where id = v_branch;
  end if;

  insert into erp_raw_facts(
    module, event_type, entity_type, entity_id, action_type,
    company_id, branch_id, region, area, route_id, customer_id, user_id, role,
    event_at, approved_at, completed_at,
    workflow_instance_id, request_type, request_status, approver_id, approval_level,
    gps_lat, gps_lng, geofence_result, location_source,
    quantity, amount, currency, uom, cost, gross_profit,
    attachment_count, attachment_type, source_table, source_id, details)
  values (
    p_module, p_event_type, f->>'entity_type', f->>'entity_id', f->>'action_type',
    v_company, v_branch, v_region, v_area,
    nullif(f->>'route_id','')::uuid, nullif(f->>'customer_id','')::uuid,
    coalesce(nullif(f->>'user_id','')::uuid, auth.uid()), f->>'role',
    coalesce(nullif(f->>'event_at','')::timestamptz, now()),
    nullif(f->>'approved_at','')::timestamptz, nullif(f->>'completed_at','')::timestamptz,
    nullif(f->>'workflow_instance_id','')::uuid, f->>'request_type', f->>'request_status',
    nullif(f->>'approver_id','')::uuid, nullif(f->>'approval_level','')::integer,
    nullif(f->>'gps_lat','')::numeric, nullif(f->>'gps_lng','')::numeric,
    f->>'geofence_result', f->>'location_source',
    nullif(f->>'quantity','')::numeric, nullif(f->>'amount','')::numeric, f->>'currency', f->>'uom',
    nullif(f->>'cost','')::numeric, nullif(f->>'gross_profit','')::numeric,
    coalesce(nullif(f->>'attachment_count','')::integer, 0), f->>'attachment_type',
    f->>'source_table', f->>'source_id',
    f - array['entity_type','entity_id','action_type','company_id','branch_id','region','area',
              'route_id','customer_id','user_id','role','event_at','approved_at','completed_at',
              'workflow_instance_id','request_type','request_status','approver_id','approval_level',
              'gps_lat','gps_lng','geofence_result','location_source','quantity','amount','currency',
              'uom','cost','gross_profit','attachment_count','attachment_type','source_table','source_id'])
  returning id into v_id;
  return v_id;
end; $$;

-- ── Customer 360: surface branch region/area in master (supersedes 0112) ────
create or replace function erp_customer_360(p_customer uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'public','pg_temp' as $$
declare
  c erp_customers; v_company uuid; v_acct uuid; v_route_rep uuid; v_sup uuid; v_mgr uuid;
  v_region text; v_area text; v_result jsonb;
begin
  select * into c from erp_customers where id = p_customer;
  if c.id is null then return null; end if;
  v_company := c.company_id;
  if not (
    (select erp_is_platform_owner())
    or (v_company = (select erp_user_company_id())
        and ((select erp_matrix_has('customers','view')) or (select erp_is_company_admin(v_company))))
  ) then
    raise exception 'forbidden';
  end if;

  v_acct := c.salesman_id;
  select rep_id into v_route_rep from erp_routes where id = c.route_id and company_id = v_company;
  select region, area into v_region, v_area from erp_branches where id = c.branch_id;
  select ub.reports_to into v_sup from erp_user_branches ub join erp_branches b on b.id = ub.branch_id
    where ub.user_id = coalesce(v_acct, v_route_rep) and b.company_id = v_company and ub.reports_to is not null limit 1;
  select ub.reports_to into v_mgr from erp_user_branches ub join erp_branches b on b.id = ub.branch_id
    where ub.user_id = v_sup and b.company_id = v_company and ub.reports_to is not null limit 1;

  select jsonb_build_object(
    'master', jsonb_build_object(
      'id', c.id, 'code', c.code, 'name', coalesce(c.name_ar, c.name), 'name_en', c.name,
      'phone', c.phone, 'credit_limit', c.credit_limit,
      'status', case when c.is_approved then 'active' else 'pending' end,
      'classification', null,
      'route', (select name from erp_routes where id = c.route_id),
      'branch', (select coalesce(name_ar, name) from erp_branches where id = c.branch_id),
      'region', v_region, 'area', v_area
    ),
    'ownership', jsonb_build_object(
      'account_owner', (select jsonb_build_object('id', id, 'name', full_name, 'email', email) from erp_profiles where id = v_acct),
      'route_owner',   (select jsonb_build_object('id', id, 'name', full_name, 'email', email) from erp_profiles where id = v_route_rep),
      'supervisor',    (select jsonb_build_object('id', id, 'name', full_name) from erp_profiles where id = v_sup),
      'manager',       (select jsonb_build_object('id', id, 'name', full_name) from erp_profiles where id = v_mgr)
    ),
    'workflow', jsonb_build_object(
      'open_requests', (select count(*) from erp_workflow_instances where company_id = v_company and status = 'pending' and entity = 'customer' and record_id = c.id::text),
      'pending_approvals', (select count(*) from erp_workflow_tasks t join erp_workflow_instances i on i.id = t.instance_id where i.company_id = v_company and i.entity = 'customer' and i.record_id = c.id::text and t.status = 'pending'),
      'recent_activities', coalesce((select jsonb_agg(jsonb_build_object('event', ev.event, 'at', ev.created_at)) from (select e.event, e.created_at from erp_workflow_events e join erp_workflow_instances i on i.id = e.instance_id where i.entity = 'customer' and i.record_id = c.id::text order by e.created_at desc limit 10) ev), '[]'::jsonb)
    ),
    'audit', jsonb_build_object(
      'recent_changes', coalesce((select jsonb_agg(jsonb_build_object('action', a.action, 'changed', a.change_set, 'by', a.actor_email, 'at', a.created_at)) from (select action, change_set, actor_email, created_at from erp_audit_logs where entity = 'customers' and entity_id = c.id::text order by created_at desc limit 10) a), '[]'::jsonb),
      'last_modified_by', (select actor_email from erp_audit_logs where entity = 'customers' and entity_id = c.id::text order by created_at desc limit 1),
      'last_modified_at', (select created_at from erp_audit_logs where entity = 'customers' and entity_id = c.id::text order by created_at desc limit 1)
    ),
    'attachments', (select jsonb_build_object(
        'total', count(*),
        'images', count(*) filter (where mime_type like 'image/%'),
        'documents', count(*) filter (where mime_type is null or mime_type not like 'image/%'),
        'certifications', count(*) filter (where lower(file_name) like '%cert%'),
        'items', coalesce(jsonb_agg(jsonb_build_object('name', file_name, 'type', mime_type, 'by', uploaded_by, 'at', created_at) order by created_at desc), '[]'::jsonb)
      ) from erp_entity_attachments where company_id = v_company and entity in ('customer','customers') and record_id = c.id::text),
    'analytics', coalesce((select jsonb_agg(jsonb_build_object('module', module, 'events', cnt, 'amount', amt, 'currency', cur, 'quantity', qty, 'gross_profit', gp)) from (
        select module, currency cur, count(*) cnt, sum(amount) amt, sum(quantity) qty, sum(gross_profit) gp
        from erp_raw_facts where company_id = v_company and customer_id = c.id group by module, currency) m), '[]'::jsonb)
  ) into v_result;
  return v_result;
end; $$;

-- ============================================================================
-- ROLLBACK (manual): restore the 0111 erp_raw_emit and 0112 erp_customer_360
-- bodies; added columns/indexes are additive and may remain.
-- ============================================================================
