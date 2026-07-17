-- Trade Spend Native Module — 004: complete category coverage (last 2 rows)
-- APPLIED to the Roshen project as ts_module_004_category_completion.
update public.dash_sku_master
set category = 'Bulk 16 SR', brand = 'Roshen'
where category is null and lower(description) like '%razy bee%' and lower(description) like '%1kg%';

update public.dash_sku_master
set category = 'Choclate Bar', brand = 'Roshen'
where category is null and lower(description) like '%milk chocolate bar with cramel filling%';
