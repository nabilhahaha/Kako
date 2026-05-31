-- ============================================================================
-- 0095: R4 Licensing Build — capability modules as first-class entitlements.
-- ----------------------------------------------------------------------------
-- Makes the Core (capability) modules — crm, workflow, analytics, field_ops,
-- integrations (finance ≙ existing accounting) — licensable alongside the
-- vertical "pack" modules. ADDITIVE + idempotent: only inserts new rows (guarded
-- by NOT EXISTS), never updates or deletes. No pricing/billing/metering changes.
--
-- Guarantees:
--   • No existing tenant loses any currently-enabled module (we only add).
--   • Existing companies keep working: capability modules are BACKFILLED enabled
--     for every existing company (integrations only where already in use).
--   • Protected verticals (clinic/pharmacy/Egyptian Drug List/distribution/
--     electrical) are untouched.
-- ============================================================================

-- 1) Plan entitlement seed — new capability keys per tier (additive).
--    free=Free, standard=Starter, pro=Professional, unlimited=Enterprise.
insert into erp_plan_modules (plan_key, module)
select v.plan_key, v.module
from (values
  ('free','crm'),
  ('standard','crm'), ('standard','analytics'), ('standard','integrations'),
  ('pro','crm'), ('pro','analytics'), ('pro','integrations'), ('pro','workflow'), ('pro','field_ops'),
  ('unlimited','crm'), ('unlimited','analytics'), ('unlimited','integrations'), ('unlimited','workflow'), ('unlimited','field_ops')
) as v(plan_key, module)
where exists (select 1 from erp_plans p where p.key = v.plan_key)
  and not exists (select 1 from erp_plan_modules pm where pm.plan_key = v.plan_key and pm.module = v.module);

-- 2) Backfill company enablement so NO existing tenant loses access.
--    crm/workflow/analytics/field_ops -> enabled for ALL existing companies
--    (these were always-available capabilities; nav items remain permission-gated).
insert into erp_company_modules (company_id, module, enabled)
select c.id, v.module, true
from erp_companies c
cross join (values ('crm'),('workflow'),('analytics'),('field_ops')) as v(module)
where not exists (
  select 1 from erp_company_modules cm where cm.company_id = c.id and cm.module = v.module
);

--    integrations -> enabled only for companies already USING integrations
--    (api keys / webhooks / connections); others stay off (off-by-default).
insert into erp_company_modules (company_id, module, enabled)
select c.id, 'integrations', true
from erp_companies c
where (
     exists (select 1 from erp_api_keys k where k.company_id = c.id)
  or exists (select 1 from erp_webhooks w where w.company_id = c.id)
  or exists (select 1 from erp_integrations i where i.company_id = c.id)
)
and not exists (
  select 1 from erp_company_modules cm where cm.company_id = c.id and cm.module = 'integrations'
);

-- 3) Business-type recommendations (additive; drives setup/marketplace defaults).
--    Only for business types already present; finance ≙ accounting (already mapped).
insert into erp_business_type_modules (business_type, module)
select v.business_type, v.module
from (values
  ('clinic','crm'), ('clinic','workflow'), ('clinic','analytics'),
  ('pharmacy','analytics'),
  ('delivery','crm'), ('delivery','analytics'), ('delivery','field_ops'), ('delivery','workflow'),
  ('wholesale','analytics'), ('wholesale','field_ops'),
  ('electronics','analytics'),
  ('hotel','workflow'),
  ('salon','crm'),
  ('laundry','workflow')
) as v(business_type, module)
where exists (select 1 from erp_business_type_modules b where b.business_type = v.business_type)
  and not exists (
    select 1 from erp_business_type_modules b2 where b2.business_type = v.business_type and b2.module = v.module
  );
