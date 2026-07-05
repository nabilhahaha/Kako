-- Customer Category — applied to the "Roshen" Supabase project as migration
-- `customer_category`. Additive and non-destructive: existing customers default
-- to 'other' with a null custom_category, preserving all rows and data.

alter table public.customers
  add column customer_category text not null default 'other',
  add column custom_category text;

alter table public.customers
  add constraint customers_category_check check (customer_category in (
    'wholesale','grocery','sweets','roastery','discounter','shop_5_115',
    'mini_market','supermarket','hypermarket','convenience','bakery','pharmacy','other'
  ));
