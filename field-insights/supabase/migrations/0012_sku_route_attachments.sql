-- Field Insights — Phase 2: lightweight, extensible foundations.
-- SKU Intelligence, Route Performance, and Generic Attachments. Additive only.

-- ---- SKU Intelligence foundation -------------------------------------
create table skus (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  code text,
  name text not null,
  brand text,
  category text,
  pack_size text,
  barcode text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on skus (category);
create unique index skus_company_code on skus (coalesce(company_id,'00000000-0000-0000-0000-000000000000'::uuid), code) where code is not null;
create trigger trg_skus_updated before update on skus
  for each row execute function fi_set_updated_at();

-- extensible link from competitor pricing to the SKU catalog
alter table competitor_price_points add column sku_id uuid references skus(id) on delete set null;

-- ---- Route Performance foundation ------------------------------------
create table routes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  name text not null,
  owner_id uuid references profiles(id),
  route_date date,
  region_id uuid references regions(id),
  area_id   uuid references areas(id),
  status text not null default 'planned',   -- planned | active | completed
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on routes (owner_id, route_date);
create index on routes (area_id);
create trigger trg_routes_updated before update on routes
  for each row execute function fi_set_updated_at();

create table route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id) on delete cascade,
  customer_id uuid references customers(id),
  seq int not null default 0,
  planned boolean not null default true,
  visit_id uuid references visits(id) on delete set null,
  status text not null default 'pending',   -- pending | visited | skipped
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on route_stops (route_id, seq);
create trigger trg_route_stops_updated before update on route_stops
  for each row execute function fi_set_updated_at();

create view v_route_performance as
  select r.id route_id, r.name, r.owner_id, r.route_date, r.area_id, r.status,
         count(s.id) planned_stops,
         count(s.id) filter (where s.visit_id is not null or s.status = 'visited') completed_stops,
         case when count(s.id) > 0
              then round(100.0 * count(s.id) filter (where s.visit_id is not null or s.status = 'visited')
                         / count(s.id), 1)
              else null end completion_pct
  from routes r
  left join route_stops s on s.route_id = r.id
  group by r.id;
alter view v_route_performance set (security_invoker = on);

-- ---- Generic Attachments support -------------------------------------
-- Polymorphic: attach a file to any entity (visit, opportunity, issue, ...).
create table attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  storage_path text not null,
  kind text,                       -- image | document | audio | other
  filename text,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references profiles(id),
  region_id uuid references regions(id),
  area_id   uuid references areas(id),
  sync_status sync_status not null default 'synced',
  created_at timestamptz not null default now()
);
create index on attachments (entity_type, entity_id);

-- ---- RLS for the new tables ------------------------------------------
alter table skus enable row level security;
create policy skus_read on skus for select to authenticated using (true);
create policy skus_write on skus for all to authenticated
  using (fi_role() in ('platform_admin','business_manager','regional_manager','area_manager'))
  with check (fi_role() in ('platform_admin','business_manager','regional_manager','area_manager'));

alter table routes enable row level security;
create policy routes_read on routes for select to authenticated
  using (fi_is_admin() or owner_id = auth.uid() or fi_can_access_area(area_id));
create policy routes_insert on routes for insert to authenticated
  with check (fi_role() <> 'viewer');
create policy routes_update on routes for update to authenticated
  using (fi_is_admin() or owner_id = auth.uid() or fi_can_access_area(area_id))
  with check (fi_is_admin() or owner_id = auth.uid() or fi_can_access_area(area_id));
create policy routes_delete on routes for delete to authenticated using (fi_is_admin());

alter table route_stops enable row level security;
create policy route_stops_read on route_stops for select to authenticated
  using (exists(select 1 from routes r where r.id = route_id
               and (fi_is_admin() or r.owner_id = auth.uid() or fi_can_access_area(r.area_id))));
create policy route_stops_write on route_stops for all to authenticated
  using (exists(select 1 from routes r where r.id = route_id
               and (fi_is_admin() or r.owner_id = auth.uid() or fi_can_access_area(r.area_id))))
  with check (fi_role() <> 'viewer');

alter table attachments enable row level security;
create policy attachments_read on attachments for select to authenticated
  using (fi_is_admin() or uploaded_by = auth.uid() or fi_can_access_area(area_id));
create policy attachments_insert on attachments for insert to authenticated
  with check (fi_role() <> 'viewer' and uploaded_by = auth.uid());
create policy attachments_update on attachments for update to authenticated
  using (fi_is_admin() or uploaded_by = auth.uid())
  with check (fi_is_admin() or uploaded_by = auth.uid());
create policy attachments_delete on attachments for delete to authenticated
  using (fi_is_admin() or uploaded_by = auth.uid());
