-- ============================================================================
-- 0126: Field Execution (FE-4a) — captures + seeded FMCG capture templates
-- ----------------------------------------------------------------------------
--   • erp_fe_captures — links a Builder form submission to its visit + customer,
--     with kind and an optional execution score. The scoring/dashboard anchor.
--   • 6 global Builder capture templates (clone-to-use), each carrying an
--     emit_fact effect so every capture pushes a raw fact automatically, and
--     subject_ref = {source:record} so the fact is attributed to the visit's
--     customer (submission.record_id). Additive + idempotent.
-- ============================================================================

-- ── Capture link (field domain) ────────────────────────────────────────────
create table if not exists erp_fe_captures (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references erp_companies(id) on delete cascade,
  visit_id      uuid references erp_fe_visits(id) on delete set null,
  customer_id   uuid references erp_customers(id) on delete set null,
  form_id       uuid references erp_form_definitions(id) on delete set null,
  submission_id uuid references erp_form_submissions(id) on delete cascade,
  kind          text not null check (kind in ('merchandising','competitor','survey','out_of_stock','opportunity','quick')),
  score         numeric,
  created_by    uuid references erp_profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_fe_captures_company on erp_fe_captures(company_id, created_at desc);
create index if not exists idx_fe_captures_visit on erp_fe_captures(visit_id);
create index if not exists idx_fe_captures_customer on erp_fe_captures(customer_id, created_at desc);

alter table erp_fe_captures enable row level security;
drop policy if exists erp_fe_captures_read on erp_fe_captures;
create policy erp_fe_captures_read on erp_fe_captures for select using (
  (select erp_is_platform_owner()) or (company_id = (select erp_user_company_id()) and (
    created_by = (select auth.uid()) or (select erp_matrix_has('field_ops','view')) or (select erp_is_company_admin(company_id))))
);
drop policy if exists erp_fe_captures_write on erp_fe_captures;
create policy erp_fe_captures_write on erp_fe_captures for all using (
  (select erp_is_platform_owner()) or (company_id = (select erp_user_company_id()) and (created_by = (select auth.uid()) or (select erp_is_company_admin(company_id))))
) with check (
  (select erp_is_platform_owner()) or (company_id = (select erp_user_company_id()) and (created_by = (select auth.uid()) or (select erp_is_company_admin(company_id))))
);
drop trigger if exists trg_audit_erp_fe_captures on erp_fe_captures;
create trigger trg_audit_erp_fe_captures after insert or update or delete on erp_fe_captures
  for each row execute function erp_audit_capture();

-- ── Seeded global capture templates ────────────────────────────────────────
insert into erp_form_definitions (company_id, key, name_ar, name_en, module, target_entity, effect, subject_ref, status, version, is_latest) values
  (null,'fe_merchandising_audit','تدقيق العرض','Merchandising Audit','field_ops','customer',
    '{"type":"emit_fact","module":"field_ops","event":"fe_merchandising","map":{"amount":"shelf_price","quantity":"display_count","share_of_shelf":"share_of_shelf","planogram":"planogram_compliance","display_type":"display_type"}}'::jsonb,
    '{"entity":"customer","source":"record"}'::jsonb,'active',1,true),
  (null,'fe_competitor_capture','رصد منافس','Competitor Capture','field_ops','customer',
    '{"type":"emit_fact","module":"field_ops","event":"fe_competitor","map":{"amount":"price","competitor":"competitor","product":"brand_product","promo":"promotion"}}'::jsonb,
    '{"entity":"customer","source":"record"}'::jsonb,'active',1,true),
  (null,'fe_store_checklist','قائمة فحص المتجر','Store Checklist','field_ops','customer',
    '{"type":"emit_fact","module":"field_ops","event":"fe_survey","map":{"quantity":"score"}}'::jsonb,
    '{"entity":"customer","source":"record"}'::jsonb,'active',1,true),
  (null,'fe_out_of_stock','نفاد مخزون','Out-of-Stock Report','field_ops','customer',
    '{"type":"emit_fact","module":"field_ops","event":"fe_out_of_stock","map":{"amount":"est_lost_sales","product":"product","severity":"severity"}}'::jsonb,
    '{"entity":"customer","source":"record"}'::jsonb,'active',1,true),
  (null,'fe_opportunity','فرصة عميل','Customer Opportunity','field_ops','customer',
    '{"type":"emit_fact","module":"field_ops","event":"fe_opportunity","map":{"amount":"est_value","opp_type":"opportunity_type"}}'::jsonb,
    '{"entity":"customer","source":"record"}'::jsonb,'active',1,true),
  (null,'fe_complaint','شكوى عميل','Customer Complaint','field_ops','customer',
    '{"type":"emit_fact","module":"field_ops","event":"fe_complaint","map":{}}'::jsonb,
    '{"entity":"customer","source":"record"}'::jsonb,'active',1,true)
on conflict do nothing;

-- Merchandising fields (Display Type, Count, Share of Shelf, Planogram, Price, Photo)
insert into erp_form_fields (form_id, key, label_ar, label_en, type, sort_order, required, options)
select d.id, x.key, x.lar, x.len, x.typ, x.ord, x.req, x.opts::jsonb
from erp_form_definitions d join (values
  ('display_type','نوع العرض','Display type','dropdown',1,true,'[{"value":"shelf","label":"Shelf"},{"value":"gondola","label":"Gondola"},{"value":"endcap","label":"End-cap"},{"value":"floor","label":"Floor display"}]'),
  ('display_count','عدد نقاط العرض','Display count','number',2,false,null),
  ('share_of_shelf','حصة الرف %','Share of shelf %','number',3,false,null),
  ('planogram_compliance','مطابقة البلانوغرام','Planogram compliance','dropdown',4,true,'[{"value":"yes","label":"Compliant"},{"value":"no","label":"Not compliant"}]'),
  ('shelf_price','سعر الرف','Shelf price','number',5,false,null),
  ('photo','صورة','Photo','image',6,false,null)
) as x(key,lar,len,typ,ord,req,opts) on true
where d.key='fe_merchandising_audit' and d.company_id is null
on conflict (form_id, key) do nothing;

-- Competitor fields (Competitor, Brand/Product, Price, Promotion, Photo)
insert into erp_form_fields (form_id, key, label_ar, label_en, type, sort_order, required, options)
select d.id, x.key, x.lar, x.len, x.typ, x.ord, x.req, x.opts::jsonb
from erp_form_definitions d join (values
  ('competitor','المنافس','Competitor','text',1,true,null),
  ('brand_product','العلامة/المنتج','Brand / product','text',2,true,null),
  ('price','السعر','Price','number',3,false,null),
  ('promotion','العرض الترويجي','Promotion','text',4,false,null),
  ('photo','صورة','Photo','image',5,false,null)
) as x(key,lar,len,typ,ord,req,opts) on true
where d.key='fe_competitor_capture' and d.company_id is null
on conflict (form_id, key) do nothing;

-- Store checklist (sample checks + score)
insert into erp_form_fields (form_id, key, label_ar, label_en, type, sort_order, required, options)
select d.id, x.key, x.lar, x.len, x.typ, x.ord, x.req, x.opts::jsonb
from erp_form_definitions d join (values
  ('availability','توفر المنتجات','Product availability','dropdown',1,false,'[{"value":"yes","label":"Yes"},{"value":"no","label":"No"}]'),
  ('visibility','وضوح العرض','Visibility','dropdown',2,false,'[{"value":"yes","label":"Yes"},{"value":"no","label":"No"}]'),
  ('cleanliness','النظافة (1-5)','Cleanliness (1-5)','number',3,false,null),
  ('score','الدرجة','Score','number',4,false,null)
) as x(key,lar,len,typ,ord,req,opts) on true
where d.key='fe_store_checklist' and d.company_id is null
on conflict (form_id, key) do nothing;

-- Out-of-stock (Product, Severity, Estimated Lost Sales, Photo)
insert into erp_form_fields (form_id, key, label_ar, label_en, type, sort_order, required, options)
select d.id, x.key, x.lar, x.len, x.typ, x.ord, x.req, x.opts::jsonb
from erp_form_definitions d join (values
  ('product','المنتج','Product','text',1,true,null),
  ('severity','الخطورة','Severity','dropdown',2,true,'[{"value":"low","label":"Low"},{"value":"medium","label":"Medium"},{"value":"high","label":"High"}]'),
  ('est_lost_sales','المبيعات المفقودة المقدّرة','Estimated lost sales','number',3,false,null),
  ('photo','صورة','Photo','image',4,false,null)
) as x(key,lar,len,typ,ord,req,opts) on true
where d.key='fe_out_of_stock' and d.company_id is null
on conflict (form_id, key) do nothing;

-- Opportunity (Type, Estimated Value, Notes)
insert into erp_form_fields (form_id, key, label_ar, label_en, type, sort_order, required, options)
select d.id, x.key, x.lar, x.len, x.typ, x.ord, x.req, x.opts::jsonb
from erp_form_definitions d join (values
  ('opportunity_type','نوع الفرصة','Opportunity type','dropdown',1,true,'[{"value":"new_sku","label":"New SKU"},{"value":"extra_display","label":"Extra display"},{"value":"promo","label":"Promotion"},{"value":"other","label":"Other"}]'),
  ('est_value','القيمة المقدّرة','Estimated value','number',2,false,null),
  ('notes','ملاحظات','Notes','text',3,false,null)
) as x(key,lar,len,typ,ord,req,opts) on true
where d.key='fe_opportunity' and d.company_id is null
on conflict (form_id, key) do nothing;

-- Complaint (note)
insert into erp_form_fields (form_id, key, label_ar, label_en, type, sort_order, required, options)
select d.id, x.key, x.lar, x.len, x.typ, x.ord, x.req, x.opts::jsonb
from erp_form_definitions d join (values
  ('note','الشكوى','Complaint','text',1,true,null)
) as x(key,lar,len,typ,ord,req,opts) on true
where d.key='fe_complaint' and d.company_id is null
on conflict (form_id, key) do nothing;

-- ============================================================================
-- ROLLBACK (manual): delete the six fe_* capture form definitions (+ fields);
-- drop table erp_fe_captures.
-- ============================================================================
