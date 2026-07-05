-- Rework Customer Category to be "not set" (NULL) by default instead of 'other'.
-- Existing customers had been auto-defaulted to 'other' and never edited, so
-- reset those to NULL (= "Category Not Set"). The check constraint permits NULL.
-- New customers must choose a category in the app; the column stays constrained
-- to the valid set when a value is present.

alter table public.customers alter column customer_category drop default;
alter table public.customers alter column customer_category drop not null;

update public.customers
set customer_category = null
where customer_category = 'other'
  and updated_at <= created_at + interval '2 seconds';
