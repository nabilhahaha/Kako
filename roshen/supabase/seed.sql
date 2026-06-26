-- =====================================================================
-- Roshen KSA — minimal seed (illustrative, safe to edit) [PROPOSAL]
-- Establishes the company, KSA, sales channels, and a sample of the
-- region/area/branch hierarchy so the SLA model can be demonstrated.
-- =====================================================================

insert into company (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Roshen')
on conflict do nothing;

insert into country (id, company_id, name, iso_code) values
  ('22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111', 'Saudi Arabia', 'SA')
on conflict do nothing;

insert into channel (name, code) values
  ('Modern Trade', 'MT'),
  ('Traditional Trade', 'TT'),
  ('HoReCa', 'HRC'),
  ('Wholesale', 'WS')
on conflict do nothing;

-- Regions (KSA commercial regions)
insert into region (id, country_id, name, code) values
  ('33333333-0001-0000-0000-000000000000','22222222-2222-2222-2222-222222222222','Central','CEN'),
  ('33333333-0002-0000-0000-000000000000','22222222-2222-2222-2222-222222222222','Western','WST'),
  ('33333333-0003-0000-0000-000000000000','22222222-2222-2222-2222-222222222222','Eastern','EST')
on conflict do nothing;

-- Sample areas
insert into area (id, region_id, name, code) values
  ('44444444-0001-0000-0000-000000000000','33333333-0001-0000-0000-000000000000','Riyadh North','RUH-N'),
  ('44444444-0002-0000-0000-000000000000','33333333-0001-0000-0000-000000000000','Riyadh South','RUH-S'),
  ('44444444-0003-0000-0000-000000000000','33333333-0002-0000-0000-000000000000','Jeddah','JED'),
  ('44444444-0004-0000-0000-000000000000','33333333-0003-0000-0000-000000000000','Dammam','DMM')
on conflict do nothing;

-- Sample branches
insert into branch (id, area_id, name, code) values
  ('55555555-0001-0000-0000-000000000000','44444444-0001-0000-0000-000000000000','Riyadh North Branch','RUH-N-01'),
  ('55555555-0002-0000-0000-000000000000','44444444-0003-0000-0000-000000000000','Jeddah Central Branch','JED-01')
on conflict do nothing;
