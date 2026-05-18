-- v3.6 — Van Stock management
--
-- Adds:
--   1. profiles.warehouse_code (the ERP warehouse identifier that ties a
--      salesman to their van).
--   2. visits.visit_type ('customer' | 'van_stock').
--   3. public.van_stock_uploads — one row per ERP upload (audit log).
--   4. public.van_stock — rows linked to the most recent upload(s).
--      Old uploads (and their stock rows via ON DELETE CASCADE) are pruned
--      automatically to the last 7 generations.
--   5. RLS:
--      uploads: authenticated SELECT; RM/TM INSERT.
--      van_stock: RM/TM full access; salesmen SELECT rows where
--                 warehouse_code matches their own profile.

-- ─── 1. Add warehouse_code to profiles ──────────────────────────────────────
alter table public.profiles
  add column if not exists warehouse_code text;

create index if not exists idx_profiles_warehouse_code
  on public.profiles(warehouse_code)
  where warehouse_code is not null;

-- ─── 2. Add visit_type to visits ────────────────────────────────────────────
alter table public.visits
  add column if not exists visit_type text not null default 'customer'
  check (visit_type in ('customer', 'van_stock'));

create index if not exists idx_visits_visit_type on public.visits(visit_type);

-- ─── 3. van_stock_uploads (audit log) ───────────────────────────────────────
create table if not exists public.van_stock_uploads (
  id              uuid primary key default gen_random_uuid(),
  uploaded_at     timestamptz not null default now(),
  uploaded_by     uuid references public.profiles(id) on delete set null,
  source_filename text,
  stats           jsonb not null default '{}'::jsonb
);

create index if not exists idx_van_stock_uploads_uploaded_at
  on public.van_stock_uploads(uploaded_at desc);

-- ─── 4. van_stock (rows linked to an upload) ────────────────────────────────
create table if not exists public.van_stock (
  id                       uuid primary key default gen_random_uuid(),
  upload_id                uuid not null references public.van_stock_uploads(id) on delete cascade,

  item_number              text not null,
  item_name                text not null,
  sk_unit                  text,
  available_qty            numeric not null,
  site                     text,
  warehouse_code           text not null,
  batch_number             text,
  expiry_date              date not null,
  salesman_name_from_excel text,

  created_at               timestamptz not null default now()
);

create index if not exists idx_van_stock_warehouse_code on public.van_stock(warehouse_code);
create index if not exists idx_van_stock_expiry_date    on public.van_stock(expiry_date);
create index if not exists idx_van_stock_upload         on public.van_stock(upload_id);

-- ─── 5. Auto-prune to keep last 7 uploads ───────────────────────────────────
create or replace function public.prune_van_stock_uploads()
returns trigger
language plpgsql
as $$
begin
  delete from public.van_stock_uploads
  where id not in (
    select id
    from public.van_stock_uploads
    order by uploaded_at desc
    limit 7
  );
  return null;
end;
$$;

drop trigger if exists trg_prune_van_stock_uploads on public.van_stock_uploads;
create trigger trg_prune_van_stock_uploads
  after insert on public.van_stock_uploads
  for each statement execute function public.prune_van_stock_uploads();

-- ─── 6. RLS ─────────────────────────────────────────────────────────────────
alter table public.van_stock_uploads enable row level security;
alter table public.van_stock         enable row level security;

-- Uploads ---------------------------------------------------------------------
drop policy if exists "van_stock_uploads select" on public.van_stock_uploads;
create policy "van_stock_uploads select" on public.van_stock_uploads
  for select to authenticated using (true);

drop policy if exists "van_stock_uploads insert by RM/TM" on public.van_stock_uploads;
create policy "van_stock_uploads insert by RM/TM" on public.van_stock_uploads
  for insert to authenticated with check (
    exists (select 1 from public.profiles
            where id = auth.uid()
              and role in ('roshen_manager', 'trade_marketing')
              and is_active)
  );

-- Stock rows ------------------------------------------------------------------
drop policy if exists "van_stock select" on public.van_stock;
create policy "van_stock select" on public.van_stock
  for select to authenticated using (
    exists (select 1 from public.profiles
            where id = auth.uid()
              and role in ('roshen_manager', 'trade_marketing')
              and is_active)
    or exists (select 1 from public.profiles p
               where p.id = auth.uid()
                 and p.role = 'salesman'
                 and p.is_active
                 and p.warehouse_code = van_stock.warehouse_code)
  );

drop policy if exists "van_stock insert by RM/TM" on public.van_stock;
create policy "van_stock insert by RM/TM" on public.van_stock
  for insert to authenticated with check (
    exists (select 1 from public.profiles
            where id = auth.uid()
              and role in ('roshen_manager', 'trade_marketing')
              and is_active)
  );

drop policy if exists "van_stock delete by RM/TM" on public.van_stock;
create policy "van_stock delete by RM/TM" on public.van_stock
  for delete to authenticated using (
    exists (select 1 from public.profiles
            where id = auth.uid()
              and role in ('roshen_manager', 'trade_marketing')
              and is_active)
  );

-- ─── 7. Grants ──────────────────────────────────────────────────────────────
grant select, insert         on public.van_stock_uploads to authenticated;
grant select, insert, delete on public.van_stock         to authenticated;

-- ─── 8. Realtime (optional — let RM/TM see new uploads instantly) ───────────
do $$
begin
  begin
    alter publication supabase_realtime add table public.van_stock_uploads;
  exception when others then null;
  end;
  begin
    alter publication supabase_realtime add table public.van_stock;
  exception when others then null;
  end;
end $$;
