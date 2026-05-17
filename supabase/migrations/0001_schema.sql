-- Near Expiry Registration System — schema
-- Idempotent: safe to re-run.

-- ─── PROFILES ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null unique,
  full_name     text not null,
  role          text not null check (role in ('salesman', 'trade_marketing', 'roshen_manager')),
  salesman_name text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_salesman_name on public.profiles(salesman_name) where role = 'salesman';

-- ─── AGGREGATED EXCEL DATA ───────────────────────────────────────────────────
-- One row per Excel upload. App reads the latest row.
create table if not exists public.aggregated_data (
  id               uuid primary key default gen_random_uuid(),
  data             jsonb not null,
  uploaded_by      uuid references public.profiles(id) on delete set null,
  uploaded_at      timestamptz not null default now(),
  salesmen_count   int not null default 0,
  customers_count  int not null default 0,
  items_count      int not null default 0,
  source_filename  text
);
create index if not exists idx_aggregated_data_uploaded_at on public.aggregated_data(uploaded_at desc);

-- ─── SUBMISSIONS ─────────────────────────────────────────────────────────────
create table if not exists public.submissions (
  id                  uuid primary key default gen_random_uuid(),

  salesman_id         uuid not null references public.profiles(id),
  salesman_name       text not null,

  cust_account        text not null,
  cust_name           text not null,
  item_id             text not null,
  item_desc           text not null,
  net_qty             numeric not null,

  phys_qty            numeric not null,
  expiry_date         date not null,
  days_remaining      int not null,
  salesman_suggestion text check (salesman_suggestion in ('promo_1_1','promo_2_1','pull_resell','no_action')),
  salesman_notes      text,

  photo_expiry_path   text,
  photo_qty_path      text,

  status              text not null default 'pending_tm'
                       check (status in ('pending_tm','pending_roshen','approved','closed_no_action')),

  tm_id               uuid references public.profiles(id),
  tm_decision         text check (tm_decision in ('promo_1_1','promo_2_1','pull_resell','no_action')),
  tm_notes            text,
  tm_decision_date    timestamptz,

  rm_id               uuid references public.profiles(id),
  rm_decision         text check (rm_decision in ('promo_1_1','promo_2_1','pull_resell','no_action')),
  rm_notes            text,
  rm_decision_date    timestamptz,

  edit_history        jsonb not null default '[]'::jsonb,

  submitted_at        timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_submissions_salesman on public.submissions(salesman_id);
create index if not exists idx_submissions_status on public.submissions(status);
create index if not exists idx_submissions_submitted_at on public.submissions(submitted_at desc);

-- ─── updated_at trigger ──────────────────────────────────────────────────────
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated
  before update on public.profiles
  for each row execute function public.update_updated_at();

drop trigger if exists trg_submissions_updated on public.submissions;
create trigger trg_submissions_updated
  before update on public.submissions
  for each row execute function public.update_updated_at();
