-- Roshen Visit Log — personal visit diary (app lives in visit-log/).
-- Applied to the "Roshen" Supabase project as migration `visit_log_init`.
-- Tables are owner-scoped so they coexist safely with any other schema.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  code text,
  city text,
  area text,
  address text,
  phone text,
  notes text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  visited_at timestamptz not null default now(),
  visit_type text not null check (visit_type in (
    'display_check','promotion','shelf_check','availability',
    'new_product','follow_up','collection','general_visit'
  )),
  status text not null check (status in ('excellent','good','needs_follow_up','urgent')),
  notes text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.visit_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  visit_id uuid not null references public.visits(id) on delete cascade,
  storage_path text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index customers_user_name_idx on public.customers (user_id, name);
create index visits_user_visited_idx on public.visits (user_id, visited_at desc);
create index visits_customer_visited_idx on public.visits (customer_id, visited_at desc);
create index visit_photos_visit_idx on public.visit_photos (visit_id, position);

create or replace function public.visit_log_set_updated_at()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.visit_log_set_updated_at();

create trigger visits_set_updated_at
  before update on public.visits
  for each row execute function public.visit_log_set_updated_at();

alter table public.customers enable row level security;
alter table public.visits enable row level security;
alter table public.visit_photos enable row level security;

create policy "customers_owner_all" on public.customers
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "visits_owner_all" on public.visits
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "visit_photos_owner_all" on public.visit_photos
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Private storage bucket for visit photos; paths are <user_id>/<visit_id>/<file>.jpg
insert into storage.buckets (id, name, public)
values ('visit-images', 'visit-images', false)
on conflict (id) do nothing;

create policy "visit_images_owner_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'visit-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "visit_images_owner_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'visit-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "visit_images_owner_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'visit-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'visit-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "visit_images_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'visit-images' and (storage.foldername(name))[1] = auth.uid()::text);
