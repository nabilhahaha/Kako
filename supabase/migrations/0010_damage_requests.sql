-- v3.7 — Damage Requests
--
-- Internal Salesman → TM workflow. RM has NO visibility.
-- Source of damaged items: either the salesman's van stock (warehouse_code
-- match) or one of the customers they serve. The customer-items list is
-- whatever the Near Expiry aggregated_data already exposes — no schema work
-- needed for the customer path; it's a pure UI / RLS concern.

-- ─── 1. damage_requests ─────────────────────────────────────────────────────
create table if not exists public.damage_requests (
  id              uuid primary key default gen_random_uuid(),
  salesman_id     uuid not null references public.profiles(id),
  salesman_name   text not null,
  source_type     text not null check (source_type in ('van', 'customer')),

  cust_account    text,
  cust_name       text,

  status          text not null default 'submitted'
                   check (status in ('submitted', 'tm_approved', 'tm_rejected')),

  tm_comment      text,
  tm_decided_at   timestamptz,
  tm_decided_by   uuid references public.profiles(id),

  submitted_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_damage_requests_salesman_id on public.damage_requests(salesman_id);
create index if not exists idx_damage_requests_status      on public.damage_requests(status);
create index if not exists idx_damage_requests_submitted   on public.damage_requests(submitted_at desc);

drop trigger if exists trg_damage_requests_updated on public.damage_requests;
create trigger trg_damage_requests_updated
  before update on public.damage_requests
  for each row execute function public.update_updated_at();

-- ─── 2. damage_request_items ────────────────────────────────────────────────
create table if not exists public.damage_request_items (
  id                  uuid primary key default gen_random_uuid(),
  damage_request_id   uuid not null references public.damage_requests(id) on delete cascade,

  item_number         text not null,
  item_name           text not null,
  quantity            numeric not null check (quantity > 0),
  unit                text,

  photo_url           text,
  notes               text,

  created_at          timestamptz not null default now()
);

create index if not exists idx_damage_request_items_request on public.damage_request_items(damage_request_id);

-- ─── 3. RLS ─────────────────────────────────────────────────────────────────
alter table public.damage_requests       enable row level security;
alter table public.damage_request_items  enable row level security;

-- damage_requests --------------------------------------------------------------

-- SELECT: salesman sees own; TM sees all. RM is intentionally NOT listed.
drop policy if exists "damage_requests select" on public.damage_requests;
create policy "damage_requests select" on public.damage_requests
  for select to authenticated using (
    salesman_id = auth.uid()
    or exists (select 1 from public.profiles
               where id = auth.uid()
                 and role = 'trade_marketing'
                 and is_active)
  );

-- INSERT: salesman only, status must start as 'submitted'.
drop policy if exists "damage_requests insert by salesman" on public.damage_requests;
create policy "damage_requests insert by salesman" on public.damage_requests
  for insert to authenticated with check (
    salesman_id = auth.uid()
    and status = 'submitted'
    and exists (select 1 from public.profiles
                where id = auth.uid() and role = 'salesman' and is_active)
  );

-- UPDATE: TM only, and only while status is still 'submitted' (write-once
-- decision). After they decide, status becomes tm_approved / tm_rejected
-- and the USING clause no longer matches.
drop policy if exists "damage_requests update by TM" on public.damage_requests;
create policy "damage_requests update by TM" on public.damage_requests
  for update to authenticated using (
    status = 'submitted'
    and exists (select 1 from public.profiles
                where id = auth.uid()
                  and role = 'trade_marketing'
                  and is_active)
  );

-- damage_request_items --------------------------------------------------------

-- SELECT: owner salesman + all active TMs (via parent).
drop policy if exists "damage_request_items select" on public.damage_request_items;
create policy "damage_request_items select" on public.damage_request_items
  for select to authenticated using (
    exists (
      select 1 from public.damage_requests dr
      where dr.id = damage_request_id
        and (
          dr.salesman_id = auth.uid()
          or exists (select 1 from public.profiles
                     where id = auth.uid()
                       and role = 'trade_marketing'
                       and is_active)
        )
    )
  );

-- INSERT: salesman only, into own parent. (Bulk-insert children right after
-- inserting the parent.)
drop policy if exists "damage_request_items insert by salesman" on public.damage_request_items;
create policy "damage_request_items insert by salesman" on public.damage_request_items
  for insert to authenticated with check (
    exists (
      select 1 from public.damage_requests dr
      where dr.id = damage_request_id
        and dr.salesman_id = auth.uid()
    )
    and exists (select 1 from public.profiles
                where id = auth.uid() and role = 'salesman' and is_active)
  );

-- ─── 4. Grants ──────────────────────────────────────────────────────────────
grant usage on schema public to authenticated;
grant select, insert, update on public.damage_requests       to authenticated;
grant select, insert         on public.damage_request_items  to authenticated;

-- ─── 5. Realtime publication ────────────────────────────────────────────────
do $$
begin
  begin alter publication supabase_realtime add table public.damage_requests;
  exception when others then null; end;
  begin alter publication supabase_realtime add table public.damage_request_items;
  exception when others then null; end;
end $$;
