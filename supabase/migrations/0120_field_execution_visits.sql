-- ============================================================================
-- 0120: Field Execution (FE-2a) — visit lifecycle, GPS & geofence (offline-ready)
-- ----------------------------------------------------------------------------
-- The visit spine + idempotent lifecycle RPCs the offline outbox syncs to:
--   • erp_fe_visits        — one row per visit; client_ref = offline idempotency key
--   • erp_fe_distance_m()   — haversine metres between two coords
--   • erp_fe_visit_start()  — idempotent check-in: stores client-captured GPS &
--     time, computes geofence, enforces reason/photo on violation, emits a raw
--     fact, audits, and alerts the rep's manager on a geofence violation
--   • erp_fe_visit_end()    — idempotent check-out: duration + completion fact
-- GPS & timestamps come from the CLIENT payload (captured at action time), never
-- now(), so offline-captured coordinates are preserved on sync. Additive + idempotent.
-- ============================================================================

-- ── Visit spine ────────────────────────────────────────────────────────────
create table if not exists erp_fe_visits (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references erp_companies(id) on delete cascade,
  client_ref         text,                       -- client-generated idempotency key (offline)
  customer_id        uuid not null references erp_customers(id) on delete cascade,
  rep_id             uuid references erp_profiles(id) on delete set null,
  route_id           uuid references erp_routes(id) on delete set null,
  plan_id            uuid,                        -- FE-3 (route plan)
  planned_date       date,
  status             text not null default 'in_progress'
                       check (status in ('planned','in_progress','completed','missed','cancelled')),
  checkin_at         timestamptz, checkin_lat numeric(10,7), checkin_lng numeric(10,7), checkin_accuracy_m numeric,
  checkout_at        timestamptz, checkout_lat numeric(10,7), checkout_lng numeric(10,7),
  duration_min       integer,
  geofence_status    text check (geofence_status in ('ok','violation','unknown')),
  distance_m         numeric,
  reason             text,
  exception_photo    text,                        -- attachment ref for out-of-fence exception
  note               text,
  created_by         uuid references erp_profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists uq_fe_visits_client_ref on erp_fe_visits(company_id, client_ref) where client_ref is not null;
create index if not exists idx_fe_visits_company on erp_fe_visits(company_id, status, planned_date);
create index if not exists idx_fe_visits_rep on erp_fe_visits(rep_id, checkin_at desc);
create index if not exists idx_fe_visits_customer on erp_fe_visits(customer_id, checkin_at desc);

alter table erp_fe_visits enable row level security;
drop policy if exists erp_fe_visits_read on erp_fe_visits;
create policy erp_fe_visits_read on erp_fe_visits for select using (
  (select erp_is_platform_owner()) or (company_id = (select erp_user_company_id()) and (
    rep_id = (select auth.uid()) or (select erp_matrix_has('field_ops','view')) or (select erp_is_company_admin(company_id))))
);
drop policy if exists erp_fe_visits_write on erp_fe_visits;
create policy erp_fe_visits_write on erp_fe_visits for all using (
  (select erp_is_platform_owner()) or (company_id = (select erp_user_company_id()) and (rep_id = (select auth.uid()) or (select erp_is_company_admin(company_id))))
) with check (
  (select erp_is_platform_owner()) or (company_id = (select erp_user_company_id()) and (rep_id = (select auth.uid()) or (select erp_is_company_admin(company_id))))
);

drop trigger if exists trg_audit_erp_fe_visits on erp_fe_visits;
create trigger trg_audit_erp_fe_visits after insert or update or delete on erp_fe_visits
  for each row execute function erp_audit_capture();
drop trigger if exists erp_fe_visits_updated on erp_fe_visits;
create trigger erp_fe_visits_updated before update on erp_fe_visits
  for each row execute function erp_set_updated_at();

-- ── Haversine distance (metres) ────────────────────────────────────────────
create or replace function erp_fe_distance_m(p_lat1 numeric, p_lng1 numeric, p_lat2 numeric, p_lng2 numeric)
returns numeric language sql immutable as $$
  select case when p_lat1 is null or p_lng1 is null or p_lat2 is null or p_lng2 is null then null else
    round((2 * 6371000 * asin(sqrt(
      power(sin(radians(p_lat2 - p_lat1) / 2), 2) +
      cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2)
    )))::numeric, 1) end;
$$;

-- ── Idempotent check-in (visit start) ──────────────────────────────────────
create or replace function erp_fe_visit_start(
  p_client_ref text, p_customer uuid, p_lat numeric, p_lng numeric,
  p_accuracy numeric default null, p_captured_at timestamptz default null,
  p_route uuid default null, p_reason text default null, p_photo text default null)
returns jsonb language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare
  v_company uuid := erp_user_company_id();
  v_existing erp_fe_visits; v_cust erp_customers;
  v_radius int; v_mode text; v_photo_thr int;
  v_dist numeric; v_status text; v_at timestamptz := coalesce(p_captured_at, now());
  v_id uuid; v_mgr uuid; v_need_photo boolean;
begin
  if v_company is null then raise exception 'no company context'; end if;
  -- Idempotency: a re-synced check-in returns the same visit, never a duplicate.
  if p_client_ref is not null then
    select * into v_existing from erp_fe_visits where company_id = v_company and client_ref = p_client_ref;
    if v_existing.id is not null then
      return jsonb_build_object('id', v_existing.id, 'geofence_status', v_existing.geofence_status,
                                'distance_m', v_existing.distance_m, 'idempotent', true);
    end if;
  end if;

  select * into v_cust from erp_customers where id = p_customer and company_id = v_company;
  if v_cust.id is null then raise exception 'customer not found'; end if;

  select geofence_radius_m, geofence_mode, geofence_photo_threshold_m
    into v_radius, v_mode, v_photo_thr from erp_fe_settings where company_id = v_company;
  v_radius := coalesce(v_radius, 150); v_mode := coalesce(v_mode, 'advisory'); v_photo_thr := coalesce(v_photo_thr, 500);

  v_dist := erp_fe_distance_m(p_lat, p_lng, v_cust.latitude, v_cust.longitude);
  v_status := case
    when v_cust.latitude is null or v_cust.longitude is null or p_lat is null then 'unknown'
    when v_dist <= v_radius then 'ok' else 'violation' end;

  if v_status = 'violation' then
    if coalesce(trim(p_reason), '') = '' then raise exception 'reason required for out-of-geofence check-in'; end if;
    v_need_photo := (v_mode = 'blocking') or (v_dist > v_photo_thr);   -- blocking ⇒ always; advisory ⇒ beyond threshold
    if v_need_photo and coalesce(trim(p_photo), '') = '' then raise exception 'exception photo required'; end if;
  end if;

  insert into erp_fe_visits(company_id, client_ref, customer_id, rep_id, route_id, status,
    checkin_at, checkin_lat, checkin_lng, checkin_accuracy_m, geofence_status, distance_m, reason, exception_photo, created_by)
  values (v_company, p_client_ref, p_customer, auth.uid(), coalesce(p_route, v_cust.route_id), 'in_progress',
    v_at, p_lat, p_lng, p_accuracy, v_status, v_dist, nullif(trim(p_reason), ''), nullif(trim(p_photo), ''), auth.uid())
  returning id into v_id;

  perform erp_raw_emit('field_ops', 'fe_visit_checkin', jsonb_build_object(
    'company_id', v_company, 'customer_id', p_customer, 'route_id', coalesce(p_route, v_cust.route_id),
    'gps_lat', p_lat, 'gps_lng', p_lng, 'geofence_result', v_status, 'location_source', 'device',
    'event_at', v_at, 'entity_type', 'fe_visit', 'entity_id', v_id::text, 'distance_m', v_dist));
  perform erp_log_audit('checkin', 'fe_visit', v_id::text, jsonb_build_object('geofence', v_status, 'distance_m', v_dist), v_company);

  if v_status = 'violation' then
    select reports_to into v_mgr from erp_user_branches where user_id = auth.uid() and reports_to is not null limit 1;
    if v_mgr is not null then
      perform erp_notify_send(v_company, v_mgr, 'fe_geofence_violation',
        jsonb_build_object('distance_m', v_dist, 'customer', v_cust.name), '/field/visits', 'fe_visit', v_id::text);
    end if;
  end if;

  return jsonb_build_object('id', v_id, 'geofence_status', v_status, 'distance_m', v_dist, 'idempotent', false);
end; $$;

-- ── Idempotent check-out (visit end) ───────────────────────────────────────
create or replace function erp_fe_visit_end(
  p_client_ref text, p_lat numeric default null, p_lng numeric default null, p_captured_at timestamptz default null)
returns jsonb language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v erp_fe_visits; v_at timestamptz; v_dur int;
begin
  if v_company is null then raise exception 'no company context'; end if;
  select * into v from erp_fe_visits where company_id = v_company and client_ref = p_client_ref;
  if v.id is null then raise exception 'visit not found'; end if;
  if v.status = 'completed' then
    return jsonb_build_object('id', v.id, 'duration_min', v.duration_min, 'idempotent', true);
  end if;
  v_at := coalesce(p_captured_at, now());
  v_dur := greatest(0, round(extract(epoch from (v_at - coalesce(v.checkin_at, v_at))) / 60)::int);
  update erp_fe_visits set status = 'completed', checkout_at = v_at, checkout_lat = p_lat, checkout_lng = p_lng, duration_min = v_dur
   where id = v.id;
  perform erp_raw_emit('field_ops', 'fe_visit_completed', jsonb_build_object(
    'company_id', v_company, 'customer_id', v.customer_id, 'route_id', v.route_id,
    'event_at', v_at, 'entity_type', 'fe_visit', 'entity_id', v.id::text, 'duration_min', v_dur));
  perform erp_log_audit('checkout', 'fe_visit', v.id::text, jsonb_build_object('duration_min', v_dur), v_company);
  return jsonb_build_object('id', v.id, 'duration_min', v_dur, 'idempotent', false);
end; $$;

revoke all on function erp_fe_visit_start(text,uuid,numeric,numeric,numeric,timestamptz,uuid,text,text) from public, anon;
grant execute on function erp_fe_visit_start(text,uuid,numeric,numeric,numeric,timestamptz,uuid,text,text) to authenticated;
revoke all on function erp_fe_visit_end(text,numeric,numeric,timestamptz) from public, anon;
grant execute on function erp_fe_visit_end(text,numeric,numeric,timestamptz) to authenticated;

-- ============================================================================
-- ROLLBACK (manual): drop erp_fe_visit_start / erp_fe_visit_end / erp_fe_distance_m
-- and table erp_fe_visits.
-- ============================================================================
