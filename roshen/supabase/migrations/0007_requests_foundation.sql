-- =====================================================================
-- Roshen KSA — 0007 Requests foundation (additive, non-destructive)
-- Business Trip · Expense (multi-line + receipts) · Leave + approvals.
-- Implements docs/REQUESTS-MODULE.md. Files in Storage; metadata in Postgres.
-- Reuses helpers is_admin/is_global/my_area_ids/my_region_ids/my_agent_ids
-- and the enqueue_notification() RPC from 0006.
-- =====================================================================

do $$ begin create type request_type as enum ('business_trip','expense','leave'); exception when duplicate_object then null; end $$;
do $$ begin create type request_status as enum ('draft','submitted','pending_approval','approved','rejected','cancelled','paid','closed'); exception when duplicate_object then null; end $$;
do $$ begin create type travel_type as enum ('domestic','international'); exception when duplicate_object then null; end $$;
do $$ begin create type transportation_type as enum ('flight','car','bus','train','other'); exception when duplicate_object then null; end $$;
do $$ begin create type expense_category as enum ('fuel','parking','taxi','hotel','meals','customer_meeting','office_admin','business_trip','other'); exception when duplicate_object then null; end $$;
do $$ begin create type leave_type as enum ('annual','sick','unpaid','emergency','other'); exception when duplicate_object then null; end $$;

alter type notification_type add value if not exists 'request_submitted';
alter type notification_type add value if not exists 'approval_required';
alter type notification_type add value if not exists 'request_approved';
alter type notification_type add value if not exists 'request_rejected';
alter type notification_type add value if not exists 'request_returned';
alter type notification_type add value if not exists 'request_paid';
alter type notification_type add value if not exists 'missing_receipt';

create table if not exists request (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references company(id) on delete cascade,
  request_type     request_type not null,
  title            text not null,
  requested_by     uuid not null references profile(id) on delete cascade,
  assigned_approver uuid references profile(id) on delete set null,
  status           request_status not null default 'draft',
  priority         task_priority,
  request_date     date not null default current_date,
  related_region_id uuid references region(id) on delete set null,
  related_city_id   uuid references city(id) on delete set null,
  related_agent_id  uuid references agent(id) on delete set null,
  related_business_trip_id uuid references request(id) on delete set null,
  related_task_id  uuid references task(id) on delete set null,
  total_amount     numeric(18,2),
  currency         text not null default 'SAR',
  submitted_at     timestamptz,
  decided_by       uuid references profile(id) on delete set null,
  decided_at       timestamptz,
  approval_comment text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists request_requester_idx on request (requested_by);
create index if not exists request_approver_idx on request (assigned_approver);
create index if not exists request_type_status_idx on request (request_type, status);
alter table request enable row level security;

create table if not exists request_approval (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references request(id) on delete cascade,
  actor_id    uuid references profile(id) on delete set null,
  action      text not null,
  from_status request_status,
  to_status   request_status,
  comment     text,
  created_at  timestamptz not null default now()
);
create index if not exists request_approval_req_idx on request_approval (request_id);
alter table request_approval enable row level security;

create table if not exists request_activity (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references request(id) on delete cascade,
  actor_id    uuid references profile(id) on delete set null,
  type        text not null,
  from_value  text,
  to_value    text,
  created_at  timestamptz not null default now()
);
create index if not exists request_activity_req_idx on request_activity (request_id);
alter table request_activity enable row level security;

create table if not exists expense_line (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references request(id) on delete cascade,
  category      expense_category not null default 'other',
  expense_date  date,
  amount        numeric(18,2) not null default 0,
  currency      text not null default 'SAR',
  description   text,
  merchant      text,
  vat_amount    numeric(18,2),
  payment_method text,
  receipt_required boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists expense_line_req_idx on expense_line (request_id);
alter table expense_line enable row level security;

create table if not exists request_attachment (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null references request(id) on delete cascade,
  expense_line_id uuid references expense_line(id) on delete cascade,
  storage_path    text not null,
  filename        text not null,
  mime_type       text,
  size_bytes      bigint,
  title           text,
  uploaded_by     uuid references profile(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists request_attachment_req_idx on request_attachment (request_id);
alter table request_attachment enable row level security;

create table if not exists business_trip_detail (
  request_id     uuid primary key references request(id) on delete cascade,
  traveler_name  text,
  purpose        text,
  justification  text,
  from_city      text,
  to_city        text,
  country        text,
  start_date     date,
  end_date       date,
  num_days       int,
  travel_type    travel_type,
  transportation_type transportation_type,
  hotel_required boolean not null default false,
  accommodation  text,
  est_flight     numeric(18,2),
  est_hotel      numeric(18,2),
  est_transport  numeric(18,2),
  est_per_diem   numeric(18,2),
  est_other      numeric(18,2),
  total_estimated numeric(18,2),
  currency       text not null default 'SAR'
);
alter table business_trip_detail enable row level security;

create table if not exists leave_detail (
  request_id     uuid primary key references request(id) on delete cascade,
  leave_type     leave_type not null default 'annual',
  start_date     date,
  end_date       date,
  num_days       int,
  reason         text,
  cover_person_id uuid references profile(id) on delete set null
);
alter table leave_detail enable row level security;

-- Visibility: requester · approver · company managers (review all) · scope · admin.
create or replace function can_see_request(
  p_requested_by uuid, p_approver uuid,
  p_related_region uuid, p_related_city uuid, p_related_agent uuid
) returns boolean language sql stable security definer set search_path = public as $$
  select
    is_admin()
    or is_global()
    or p_requested_by = auth.uid()
    or p_approver = auth.uid()
    or (p_related_region is not null and p_related_region in (select my_region_ids()))
    or (p_related_city is not null and p_related_city in (select c.id from city c where c.region_id in (select my_region_ids())))
    or (p_related_agent is not null and p_related_agent in (select my_agent_ids()));
$$;
revoke execute on function can_see_request(uuid,uuid,uuid,uuid,uuid) from anon, public;
grant execute on function can_see_request(uuid,uuid,uuid,uuid,uuid) to authenticated;

drop policy if exists request_select on request;
create policy request_select on request for select to authenticated
  using (can_see_request(requested_by, assigned_approver, related_region_id, related_city_id, related_agent_id));
drop policy if exists request_insert on request;
create policy request_insert on request for insert to authenticated
  with check (requested_by = auth.uid());
drop policy if exists request_update on request;
create policy request_update on request for update to authenticated
  using (requested_by = auth.uid() or assigned_approver = auth.uid() or is_global() or is_admin())
  with check (requested_by = auth.uid() or assigned_approver = auth.uid() or is_global() or is_admin());
drop policy if exists request_delete on request;
create policy request_delete on request for delete to authenticated
  using (requested_by = auth.uid() or is_admin());

-- Child tables: visible iff parent request visible; writable by requester/global/admin
-- (line/detail edits enforced as "draft only" in server actions).
do $$
declare tname text;
begin
  foreach tname in array array['request_approval','request_activity','expense_line','request_attachment','business_trip_detail','leave_detail']
  loop
    execute format('drop policy if exists %1$s_select on %1$s;', tname);
    execute format('create policy %1$s_select on %1$s for select to authenticated using (request_id in (select id from request));', tname);
    execute format('drop policy if exists %1$s_write on %1$s;', tname);
    execute format($f$create policy %1$s_write on %1$s for all to authenticated
      using (exists (select 1 from request r where r.id = request_id and (r.requested_by = auth.uid() or r.assigned_approver = auth.uid() or is_global() or is_admin())))
      with check (exists (select 1 from request r where r.id = request_id and (r.requested_by = auth.uid() or r.assigned_approver = auth.uid() or is_global() or is_admin())));$f$, tname);
  end loop;
end$$;

-- Private receipts bucket (10 MB; pdf + images).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('request-receipts', 'request-receipts', false, 10485760,
        array['application/pdf','image/jpeg','image/png','image/heic','image/heif','image/webp','image/gif'])
on conflict (id) do nothing;

-- Storage RLS (path: <request_id>/<file>) — mirror request visibility.
drop policy if exists req_receipt_read on storage.objects;
create policy req_receipt_read on storage.objects for select to authenticated
  using (bucket_id = 'request-receipts' and ((storage.foldername(name))[1])::uuid in (select id from request));
drop policy if exists req_receipt_insert on storage.objects;
create policy req_receipt_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'request-receipts' and owner = auth.uid()
    and ((storage.foldername(name))[1])::uuid in (select id from request));
drop policy if exists req_receipt_delete on storage.objects;
create policy req_receipt_delete on storage.objects for delete to authenticated
  using (bucket_id = 'request-receipts'
    and (owner = auth.uid() or ((storage.foldername(name))[1])::uuid in (select id from request r where r.requested_by = auth.uid() or is_global() or is_admin())));
