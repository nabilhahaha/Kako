-- v3.5 — visit-based architecture
--
-- A "visit" = one salesman + one customer + one day, containing many items.
-- Decisions (TM, RM) are made per item, not per visit.
--
-- This migration:
--   1. Drops the legacy submissions table (and its policies/triggers).
--   2. Creates public.visits and public.visit_items with full RLS.
--   3. Adds a trigger that keeps visits.status in sync with its items.
--   4. Updates the supabase_realtime publication.

-- ─── 1. Drop legacy ──────────────────────────────────────────────────────────
drop trigger if exists trg_submissions_updated on public.submissions;
drop table if exists public.submissions cascade;

-- ─── 2a. visits ──────────────────────────────────────────────────────────────
create table if not exists public.visits (
  id            uuid primary key default gen_random_uuid(),

  salesman_id   uuid not null references public.profiles(id),
  salesman_name text not null,

  cust_account  text not null,
  cust_name     text not null,

  visit_date    date not null default current_date,
  status        text not null default 'draft'
                check (status in ('draft', 'pending_tm', 'pending_roshen', 'completed')),

  notes         text,

  submitted_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_visits_salesman on public.visits(salesman_id);
create index if not exists idx_visits_status on public.visits(status);
create index if not exists idx_visits_created on public.visits(created_at desc);

drop trigger if exists trg_visits_updated on public.visits;
create trigger trg_visits_updated
  before update on public.visits
  for each row execute function public.update_updated_at();

-- ─── 2b. visit_items ─────────────────────────────────────────────────────────
create table if not exists public.visit_items (
  id                  uuid primary key default gen_random_uuid(),
  visit_id            uuid not null references public.visits(id) on delete cascade,

  item_id             text not null,
  item_desc           text not null,
  net_qty             numeric not null,
  phys_qty            numeric not null,
  expiry_date         date not null,
  days_remaining      int not null,

  photo_expiry_path   text,
  photo_qty_path      text,

  salesman_suggestion text check (salesman_suggestion in ('promo_1_1','promo_2_1','pull_resell','no_action')),
  salesman_notes      text,

  tm_id               uuid references public.profiles(id),
  tm_decision         text check (tm_decision in ('promo_1_1','promo_2_1','pull_resell','no_action')),
  tm_notes            text,
  tm_decision_date    timestamptz,

  rm_id               uuid references public.profiles(id),
  rm_decision         text check (rm_decision in ('promo_1_1','promo_2_1','pull_resell','no_action')),
  rm_notes            text,
  rm_decision_date    timestamptz,

  item_status         text not null default 'pending_tm'
                       check (item_status in ('pending_tm','pending_roshen','approved','closed_no_action')),

  edit_history        jsonb not null default '[]'::jsonb,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (visit_id, item_id)
);

create index if not exists idx_visit_items_visit on public.visit_items(visit_id);
create index if not exists idx_visit_items_status on public.visit_items(item_status);

drop trigger if exists trg_visit_items_updated on public.visit_items;
create trigger trg_visit_items_updated
  before update on public.visit_items
  for each row execute function public.update_updated_at();

-- ─── 3. Auto-roll-up visit.status from its items ────────────────────────────
create or replace function public.recompute_visit_status()
returns trigger
language plpgsql
as $$
declare
  v_id uuid := coalesce(NEW.visit_id, OLD.visit_id);
  v_status text;
  new_status text;
begin
  select status into v_status from public.visits where id = v_id;
  if v_status is null or v_status = 'draft' then
    return coalesce(NEW, OLD);
  end if;

  if exists (select 1 from public.visit_items where visit_id = v_id and item_status = 'pending_tm') then
    new_status := 'pending_tm';
  elsif exists (select 1 from public.visit_items where visit_id = v_id and item_status = 'pending_roshen') then
    new_status := 'pending_roshen';
  else
    new_status := 'completed';
  end if;

  if new_status <> v_status then
    update public.visits set status = new_status where id = v_id;
  end if;

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_visit_items_recompute on public.visit_items;
create trigger trg_visit_items_recompute
  after insert or update or delete on public.visit_items
  for each row execute function public.recompute_visit_status();

-- ─── 4. RLS ──────────────────────────────────────────────────────────────────
alter table public.visits enable row level security;
alter table public.visit_items enable row level security;

-- VISITS ---------------------------------------------------------------------

-- SELECT: salesman sees own; TM/RM see anything that's been submitted
-- (drafts stay private to the salesman).
drop policy if exists "visits select" on public.visits;
create policy "visits select" on public.visits
  for select to authenticated using (
    salesman_id = auth.uid()
    or (
      status <> 'draft'
      and exists (
        select 1 from public.profiles
        where id = auth.uid()
          and role in ('trade_marketing', 'roshen_manager')
          and is_active
      )
    )
  );

-- INSERT: salesmen only, as themselves, starting in draft.
drop policy if exists "visits insert" on public.visits;
create policy "visits insert" on public.visits
  for insert to authenticated with check (
    salesman_id = auth.uid()
    and status = 'draft'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'salesman' and is_active
    )
  );

-- UPDATE: salesman can edit own draft / submit it.
drop policy if exists "visits update by salesman" on public.visits;
create policy "visits update by salesman" on public.visits
  for update to authenticated using (
    salesman_id = auth.uid()
    and status in ('draft', 'pending_tm')
  );

-- DELETE: salesman can delete own draft only.
drop policy if exists "visits delete by salesman" on public.visits;
create policy "visits delete by salesman" on public.visits
  for delete to authenticated using (
    salesman_id = auth.uid() and status = 'draft'
  );

-- VISIT_ITEMS ----------------------------------------------------------------

drop policy if exists "visit_items select" on public.visit_items;
create policy "visit_items select" on public.visit_items
  for select to authenticated using (
    exists (
      select 1 from public.visits v
      where v.id = visit_id
        and (
          v.salesman_id = auth.uid()
          or (
            v.status <> 'draft'
            and exists (
              select 1 from public.profiles
              where id = auth.uid()
                and role in ('trade_marketing','roshen_manager')
                and is_active
            )
          )
        )
    )
  );

drop policy if exists "visit_items insert by salesman" on public.visit_items;
create policy "visit_items insert by salesman" on public.visit_items
  for insert to authenticated with check (
    exists (
      select 1 from public.visits v
      where v.id = visit_id
        and v.salesman_id = auth.uid()
        and v.status = 'draft'
    )
  );

drop policy if exists "visit_items delete by salesman" on public.visit_items;
create policy "visit_items delete by salesman" on public.visit_items
  for delete to authenticated using (
    exists (
      select 1 from public.visits v
      where v.id = visit_id
        and v.salesman_id = auth.uid()
        and v.status = 'draft'
    )
  );

-- UPDATE policies are split by role + the row's current item_status.

-- Salesman can edit own items while parent visit is draft (fix details before submit).
drop policy if exists "visit_items update by salesman" on public.visit_items;
create policy "visit_items update by salesman" on public.visit_items
  for update to authenticated using (
    exists (
      select 1 from public.visits v
      where v.id = visit_id
        and v.salesman_id = auth.uid()
        and v.status = 'draft'
    )
  );

-- TM updates items waiting on TM.
drop policy if exists "visit_items update by TM" on public.visit_items;
create policy "visit_items update by TM" on public.visit_items
  for update to authenticated using (
    item_status = 'pending_tm'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'trade_marketing' and is_active
    )
  );

-- RM updates items waiting on RM, or already-approved items inside the 48h window.
drop policy if exists "visit_items update by RM" on public.visit_items;
create policy "visit_items update by RM" on public.visit_items
  for update to authenticated using (
    (
      item_status = 'pending_roshen'
      or (
        item_status = 'approved'
        and rm_decision_date is not null
        and rm_decision_date > now() - interval '48 hours'
      )
    )
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'roshen_manager' and is_active
    )
  );

-- ─── 5. Explicit grants (Supabase already grants these by default, but the
--        user spec asks for them explicitly) ───────────────────────────────
grant select, insert, update, delete on public.visits to authenticated;
grant select, insert, update, delete on public.visit_items to authenticated;

-- ─── 6. Realtime publication ────────────────────────────────────────────────
do $$
begin
  begin
    alter publication supabase_realtime drop table public.submissions;
  exception when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.visits;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.visit_items;
  exception when duplicate_object then null;
  end;
end $$;
