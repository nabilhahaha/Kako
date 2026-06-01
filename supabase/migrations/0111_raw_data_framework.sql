-- ============================================================================
-- 0111: Platform Foundation #4 — Raw Data Framework (canonical analytics layer)
-- ----------------------------------------------------------------------------
-- One append-only fact table every module writes into, so analytics / Customer
-- 360 / AI / enterprise reporting read a single stable schema — no per-module
-- reporting schemas. Standardized dimensions (identity / time / workflow /
-- location / business / financial / attachments) as typed columns, plus a
-- `details` JSONB for module-specific extras. Tenant-isolated via RLS;
-- partition-ready by event_at. Additive — nothing writes here until modules
-- adopt the writer, so no existing behaviour changes.
-- ============================================================================

create table if not exists erp_raw_facts (
  id                   uuid primary key default gen_random_uuid(),

  -- Business
  module               text not null,                 -- visits | merchandising | inventory | trade_spend | expiry | sales_execution | ...
  event_type           text not null,                 -- module-specific event key
  entity_type          text,
  entity_id            text,
  action_type          text,                          -- create | update | approve | visit | sale | return | ...

  -- Identity
  company_id           uuid references erp_companies(id) on delete cascade,
  branch_id            uuid,
  region               text,
  area                 text,
  route_id             uuid,
  customer_id          uuid,
  user_id              uuid,
  role                 text,

  -- Time
  created_at           timestamptz not null default now(),
  event_at             timestamptz not null default now(),
  approved_at          timestamptz,
  completed_at         timestamptz,

  -- Workflow
  workflow_instance_id uuid,
  request_type         text,
  request_status       text,
  approver_id          uuid,
  approval_level       integer,

  -- Location
  gps_lat              numeric,
  gps_lng              numeric,
  geofence_result      text,                          -- inside | outside | unknown
  location_source      text,                          -- gps | manual | ip | none

  -- Financial (numeric for analytics; module decides units)
  quantity             numeric,
  amount               numeric,
  cost                 numeric,
  gross_profit         numeric,

  -- Attachments
  attachment_count     integer not null default 0,
  attachment_type      text,

  -- Module-specific extras
  details              jsonb not null default '{}'::jsonb
);

-- Analytics indexes (time-series by tenant / customer / route / module / workflow)
create index if not exists idx_raw_company_module on erp_raw_facts(company_id, module, event_at desc);
create index if not exists idx_raw_company_customer on erp_raw_facts(company_id, customer_id, event_at desc);
create index if not exists idx_raw_company_route on erp_raw_facts(company_id, route_id, event_at desc);
create index if not exists idx_raw_company_user on erp_raw_facts(company_id, user_id, event_at desc);
create index if not exists idx_raw_entity on erp_raw_facts(company_id, entity_type, entity_id);
create index if not exists idx_raw_workflow on erp_raw_facts(workflow_instance_id);
create index if not exists idx_raw_event_at on erp_raw_facts(event_at desc);

alter table erp_raw_facts enable row level security;
-- Read: platform owner (all) or the tenant's own facts (analytics / Customer 360
-- / reporting run within the tenant). Writes only via the SECURITY DEFINER
-- emitter below (and the service-role ETL/dispatcher).
drop policy if exists erp_raw_facts_read on erp_raw_facts;
create policy erp_raw_facts_read on erp_raw_facts for select
  using ((select erp_is_platform_owner()) or company_id = (select erp_user_company_id()));

-- ── Generic writer: modules emit a fact as JSONB; standardized keys map to
--    columns, the rest land in details. company/user default from context. ──
create or replace function erp_raw_emit(p_module text, p_event_type text, p_fact jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare v_id uuid; v_company uuid; f jsonb := coalesce(p_fact, '{}'::jsonb);
begin
  v_company := coalesce(nullif(f->>'company_id','')::uuid, erp_user_company_id());
  insert into erp_raw_facts(
    module, event_type, entity_type, entity_id, action_type,
    company_id, branch_id, region, area, route_id, customer_id, user_id, role,
    event_at, approved_at, completed_at,
    workflow_instance_id, request_type, request_status, approver_id, approval_level,
    gps_lat, gps_lng, geofence_result, location_source,
    quantity, amount, cost, gross_profit,
    attachment_count, attachment_type, details)
  values (
    p_module, p_event_type, f->>'entity_type', f->>'entity_id', f->>'action_type',
    v_company, nullif(f->>'branch_id','')::uuid, f->>'region', f->>'area',
    nullif(f->>'route_id','')::uuid, nullif(f->>'customer_id','')::uuid,
    coalesce(nullif(f->>'user_id','')::uuid, auth.uid()), f->>'role',
    coalesce(nullif(f->>'event_at','')::timestamptz, now()),
    nullif(f->>'approved_at','')::timestamptz, nullif(f->>'completed_at','')::timestamptz,
    nullif(f->>'workflow_instance_id','')::uuid, f->>'request_type', f->>'request_status',
    nullif(f->>'approver_id','')::uuid, nullif(f->>'approval_level','')::integer,
    nullif(f->>'gps_lat','')::numeric, nullif(f->>'gps_lng','')::numeric,
    f->>'geofence_result', f->>'location_source',
    nullif(f->>'quantity','')::numeric, nullif(f->>'amount','')::numeric,
    nullif(f->>'cost','')::numeric, nullif(f->>'gross_profit','')::numeric,
    coalesce(nullif(f->>'attachment_count','')::integer, 0), f->>'attachment_type',
    -- remaining keys → details
    f - array['entity_type','entity_id','action_type','company_id','branch_id','region','area',
              'route_id','customer_id','user_id','role','event_at','approved_at','completed_at',
              'workflow_instance_id','request_type','request_status','approver_id','approval_level',
              'gps_lat','gps_lng','geofence_result','location_source','quantity','amount','cost',
              'gross_profit','attachment_count','attachment_type'])
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function erp_raw_emit(text,text,jsonb) from public, anon;
grant execute on function erp_raw_emit(text,text,jsonb) to authenticated;

-- ============================================================================
-- ROLLBACK (manual): drop erp_raw_emit and erp_raw_facts. No other data touched.
-- NOTE (ops): erp_raw_facts is partition-ready — convert to RANGE partitioning
-- on event_at when volume warrants; the schema/writer do not change.
-- ============================================================================
