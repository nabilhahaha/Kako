-- =====================================================================
-- Roshen KSA — 0023 Sales Map / Geo sales (additive, non-destructive)
-- Adds city coordinates and a geo sales line view for the Sales Map page.
-- =====================================================================

-- City coordinates (nullable; seeded for the 20 real KSA cities).
alter table city add column if not exists latitude numeric;
alter table city add column if not exists longitude numeric;

-- Geo sales line: attributes each sales_fact line to a city using the most
-- reliable available source, and resolves main/sub channel (parent_id = main).
-- City attribution order: (1) customer-master city via customer_code, then
-- (2) the distributor's city ONLY when the agent has one (single-city), else
-- (3) NULL = "Unassigned" (multi-city master distributors have agent.city_id
-- null, so they correctly fall through rather than being forced to one city).
-- A `city_source` column exposes which rule was used (customer/distributor/
-- unassigned) for the data-quality note. security_invoker => the caller's RLS
-- on sales_fact is enforced (scope safe).
create view sales_geo_line with (security_invoker = on) as
select
  sf.id,
  sf.company_id,
  coalesce(
    (select c.city_id from customer c
       where c.company_id = sf.company_id and c.customer_code = sf.customer_code and c.city_id is not null
       limit 1),
    ag.city_id
  ) as city_id,
  case
    when (select c.city_id from customer c
            where c.company_id = sf.company_id and c.customer_code = sf.customer_code and c.city_id is not null
            limit 1) is not null then 'customer'
    when ag.city_id is not null then 'distributor'
    else 'unassigned'
  end as city_source,
  sf.region_id,
  sf.agent_id,
  coalesce(ch.parent_id, ch.id) as main_channel_id,
  case when ch.parent_id is not null then sf.channel_id else null end as sub_channel_id,
  sf.period_month,
  sf.invoice_date,
  sf.invoice_number,
  sf.customer_code,
  coalesce(sf.net_sales_ex_vat, 0) as net_sales,
  coalesce(sf.sales_qty_cartons, 0) as cartons
from sales_fact sf
left join agent ag on ag.id = sf.agent_id
left join channel ch on ch.id = sf.channel_id;

grant select on sales_geo_line to authenticated;

-- Seed coordinates for the 20 real cities (idempotent).
update city c set latitude = v.lat, longitude = v.lng
from (values
  ('Riyadh',24.7136,46.6753),('Al Kharj',24.1483,47.3050),
  ('Qassim',26.3260,43.9750),('Dawadmi',24.5070,44.3920),('Hail',27.5114,41.7208),
  ('Dammam',26.4207,50.0888),('Al Ahsa',25.3833,49.5867),('Hafr Al Batin',28.4342,45.9636),
  ('Al Jouf',29.9697,40.1000),('Arar',30.9753,41.0381),('Sakaka',29.9697,40.2064),('Tabuk',28.3835,36.5662),
  ('Jeddah',21.4858,39.1925),('Makkah',21.3891,39.8579),('Madinah',24.5247,39.5692),('Yanbu',24.0890,38.0618),('Taif',21.2854,40.4249),
  ('Khamis Mushait',18.3060,42.7290),('Jazan',16.8892,42.5611),('Najran',17.4933,44.1277)
) v(name, lat, lng)
where lower(c.name) = lower(v.name);
