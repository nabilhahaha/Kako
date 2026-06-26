-- =====================================================================
-- Roshen KSA — minimal seed (illustrative, safe to edit) [PROPOSAL]
-- Establishes the company, KSA, configurable channels, and a sample of
-- the region/area/branch hierarchy so the SLA model can be demonstrated.
-- All rows carry company_id for multi-company safety.
-- =====================================================================

insert into company (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Roshen')
on conflict do nothing;

insert into country (id, company_id, name, iso_code) values
  ('22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111', 'Saudi Arabia', 'SA')
on conflict do nothing;

-- Channels are configurable; seed a starting set.
insert into channel (company_id, name, code) values
  ('11111111-1111-1111-1111-111111111111', 'Modern Trade', 'MT'),
  ('11111111-1111-1111-1111-111111111111', 'Traditional Trade', 'TT'),
  ('11111111-1111-1111-1111-111111111111', 'HoReCa', 'HRC'),
  ('11111111-1111-1111-1111-111111111111', 'Wholesale', 'WS')
on conflict do nothing;

-- Regions (KSA commercial regions)
insert into region (id, company_id, country_id, name, code) values
  ('33333333-0001-0000-0000-000000000000','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','Central','CEN'),
  ('33333333-0002-0000-0000-000000000000','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','Western','WST'),
  ('33333333-0003-0000-0000-000000000000','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','Eastern','EST')
on conflict do nothing;

-- Sample areas
insert into area (id, company_id, region_id, name, code) values
  ('44444444-0001-0000-0000-000000000000','11111111-1111-1111-1111-111111111111','33333333-0001-0000-0000-000000000000','Riyadh North','RUH-N'),
  ('44444444-0002-0000-0000-000000000000','11111111-1111-1111-1111-111111111111','33333333-0001-0000-0000-000000000000','Riyadh South','RUH-S'),
  ('44444444-0003-0000-0000-000000000000','11111111-1111-1111-1111-111111111111','33333333-0002-0000-0000-000000000000','Jeddah','JED'),
  ('44444444-0004-0000-0000-000000000000','11111111-1111-1111-1111-111111111111','33333333-0003-0000-0000-000000000000','Dammam','DMM')
on conflict do nothing;

-- Sample branches
insert into branch (id, company_id, area_id, name, code) values
  ('55555555-0001-0000-0000-000000000000','11111111-1111-1111-1111-111111111111','44444444-0001-0000-0000-000000000000','Riyadh North Branch','RUH-N-01'),
  ('55555555-0002-0000-0000-000000000000','11111111-1111-1111-1111-111111111111','44444444-0003-0000-0000-000000000000','Jeddah Central Branch','JED-01')
on conflict do nothing;

-- Sample agents/distributors
insert into agent (id, company_id, branch_id, channel_id, type, code, name) values
  ('66666666-0001-0000-0000-000000000000','11111111-1111-1111-1111-111111111111','55555555-0001-0000-0000-000000000000',
     (select id from channel where company_id='11111111-1111-1111-1111-111111111111' and code='MT'),
     'distributor','AGT-1001','Riyadh North Distributor A'),
  ('66666666-0002-0000-0000-000000000000','11111111-1111-1111-1111-111111111111','55555555-0002-0000-0000-000000000000',
     (select id from channel where company_id='11111111-1111-1111-1111-111111111111' and code='TT'),
     'distributor','AGT-2001','Jeddah Distributor B')
on conflict do nothing;

-- Company-wide value-mapping examples (agent_id NULL = global fallback).
-- Channel synonyms → canonical channel.
insert into value_mapping (company_id, agent_id, dimension, source_value, channel_id)
select '11111111-1111-1111-1111-111111111111', null, 'channel', sv,
       (select id from channel where company_id='11111111-1111-1111-1111-111111111111' and code=cc)
from (values
  ('TT','TT'),('Traditional','TT'),('Traditional Trade','TT'),('GT','TT'),
  ('MT','MT'),('Modern','MT'),('Modern Trade','MT'),
  ('HoReCa','HRC'),('Horeca','HRC'),
  ('WS','WS'),('Wholesale','WS')
) as m(sv,cc)
on conflict do nothing;

-- City synonyms → canonical city (add cities first).
insert into city (company_id, region_id, name) values
  ('11111111-1111-1111-1111-111111111111','33333333-0001-0000-0000-000000000000','Riyadh'),
  ('11111111-1111-1111-1111-111111111111','33333333-0002-0000-0000-000000000000','Jeddah')
on conflict do nothing;

insert into value_mapping (company_id, agent_id, dimension, source_value, city_id)
select '11111111-1111-1111-1111-111111111111', null, 'city', sv,
       (select id from city where company_id='11111111-1111-1111-1111-111111111111' and name=cn)
from (values
  ('Riyadh','Riyadh'),('RUH','Riyadh'),('الرياض','Riyadh'),
  ('Jeddah','Jeddah'),('JED','Jeddah'),('جدة','Jeddah')
) as m(sv,cn)
on conflict do nothing;
