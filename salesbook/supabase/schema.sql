-- SalesBook — Supabase / PostgreSQL schema
-- Apply with: supabase db execute -f supabase/schema.sql   (or via the SQL editor)
--
-- The app currently persists a single JSONB "workflow state" document. The
-- normalized tables below are the target production model; the JSONB table is
-- what the dependency-free SupabaseStore adapter reads/writes today. Migrate
-- from one to the other incrementally.

-- ---------------------------------------------------------------------------
-- Minimal: single-document workflow state (used by SupabaseStore today)
-- ---------------------------------------------------------------------------
create table if not exists public.salesbook_state (
  id    text primary key default 'singleton',
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Target normalized model (for full production migration)
-- ---------------------------------------------------------------------------
create type approval_status as enum ('pending', 'approved', 'rejected');
create type user_role as enum
  ('super_admin','company_admin','regional_manager','area_manager','supervisor','rep');

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  name_ar text not null,
  name_en text,
  phone text unique not null,
  email text,
  role user_role not null default 'rep',
  status approval_status not null default 'pending',
  reputation int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id text primary key,
  company_id uuid references public.companies(id) on delete cascade,
  name_ar text not null, name_en text,
  city text, area_ar text, area_en text,
  score int not null default 0,
  data jsonb not null default '{}'::jsonb,  -- pay/move/kyc/contacts/etc.
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id text references public.customers(id) on delete cascade,
  author_id uuid references public.users(id),
  body text, image_paths text[], voice_path text,
  status approval_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.customer_history (
  id uuid primary key default gen_random_uuid(),
  customer_id text references public.customers(id) on delete cascade,
  field text not null, old_value text, new_value text,
  changed_by uuid references public.users(id),
  status approval_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.membership_requests (
  id uuid primary key default gen_random_uuid(),
  applicant jsonb not null,
  status approval_status not null default 'pending',
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.review_queue (
  id uuid primary key default gen_random_uuid(),
  customer_id text references public.customers(id) on delete cascade,
  payload jsonb not null,
  status approval_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  sender_id uuid references public.users(id),
  body text, kind text,
  created_at timestamptz not null default now()
);

create index if not exists idx_customers_company on public.customers(company_id);
create index if not exists idx_notes_customer on public.customer_notes(customer_id);
create index if not exists idx_messages_chat on public.messages(chat_id);

-- Row-Level Security scaffolding (enable + write policies per company before prod).
alter table public.customers        enable row level security;
alter table public.customer_notes   enable row level security;
alter table public.messages         enable row level security;
alter table public.membership_requests enable row level security;
alter table public.review_queue     enable row level security;
