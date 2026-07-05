-- Customer profile enhancement: reshape category to the sales value set and add
-- required Roshen availability + distributor. Safe + backfilled; no data lost.

alter table public.customers drop constraint if exists customers_category_check;

-- Normalize any legacy category values into the new set (all are currently
-- null, but map defensively in case any exist).
update public.customers set customer_category = case customer_category
  when 'sweets' then 'sweet_shop'
  when 'shop_5_115' then 'store_5'
  when 'mini_market' then 'other'
  when 'supermarket' then 'other'
  when 'hypermarket' then 'other'
  when 'convenience' then 'other'
  when 'bakery' then 'other'
  when 'pharmacy' then 'other'
  else customer_category
end
where customer_category is not null;

-- Backfill: category is required going forward.
update public.customers set customer_category = 'other' where customer_category is null;

alter table public.customers
  add column if not exists roshen_available boolean not null default false,
  add column if not exists distributor text not null default 'other';

alter table public.customers alter column customer_category set default 'other';
alter table public.customers alter column customer_category set not null;

alter table public.customers
  add constraint customers_category_check
  check (customer_category in
    ('grocery', 'sweet_shop', 'roastery', 'discounter', 'wholesale', 'store_5', 'store_11_5', 'other'));

alter table public.customers
  add constraint customers_distributor_check
  check (distributor in ('gcc', 'relia', 'tofla', 'tala', 'other'));

create index if not exists customers_category_idx on public.customers (customer_category);
create index if not exists customers_distributor_idx on public.customers (distributor);
create index if not exists customers_roshen_idx on public.customers (roshen_available);
