-- ============================================================================
-- 0242: Form Builder (8F-2) — expand Customer Data Update to FMCG master data
-- ----------------------------------------------------------------------------
-- Grows the seeded global Customer Data Update form (0241) to the FMCG master-data
-- use cases from day one: CR + VAT, National Address, Phone + contacts,
-- Classification / Channel / Segment / Route (dynamic per-tenant selects resolved
-- server-side via optionsSource), GPS, supporting documents, and the change reason.
-- Every entity-backed field binds to a governed CUSTOMER field via governanceKey
-- (key === column), so visibility / required / editable / conditional rules resolve
-- through the single Dynamic Field Governance path. Updates the PUBLISHED v1 schema
-- in place (pre-pilot, INERT until KAKO_FORM_BUILDER). Mirrors customerDataUpdateForm()
-- in src/lib/form-builder/forms.ts. Idempotent. Depends on 0240/0241.
-- ============================================================================

UPDATE erp_form_versions v
SET schema = '{"sections":[
   {"key":"identity","title":"Legal identity","titleAr":"الهوية النظامية","fields":[
     {"key":"cr_number","label":"CR number","labelAr":"السجل التجاري","type":"text","governanceKey":"cr_number"},
     {"key":"tax_number","label":"VAT number","labelAr":"الرقم الضريبي","type":"text","governanceKey":"tax_number"},
     {"key":"national_address","label":"National address","labelAr":"العنوان الوطني","type":"text","governanceKey":"national_address"}
   ]},
   {"key":"contact","title":"Contact details","titleAr":"بيانات التواصل","fields":[
     {"key":"phone","label":"Phone","labelAr":"الهاتف","type":"text","governanceKey":"phone"},
     {"key":"contact_person","label":"Contact person","labelAr":"مسؤول التواصل","type":"text","governanceKey":"contact_person"},
     {"key":"contact_phone","label":"Contact phone","labelAr":"هاتف التواصل","type":"text","governanceKey":"contact_phone"}
   ]},
   {"key":"classification","title":"Classification & routing","titleAr":"التصنيف والتوزيع","fields":[
     {"key":"classification_id","label":"Classification","labelAr":"التصنيف","type":"select","governanceKey":"classification_id","optionsSource":{"lookup":"classification"}},
     {"key":"channel_id","label":"Channel","labelAr":"القناة","type":"select","governanceKey":"channel_id","optionsSource":{"lookup":"channel"}},
     {"key":"segment_id","label":"Segment","labelAr":"الشريحة","type":"select","governanceKey":"segment_id","optionsSource":{"lookup":"segment"}},
     {"key":"route_id","label":"Route","labelAr":"خط السير","type":"select","governanceKey":"route_id","optionsSource":{"table":"erp_routes"}}
   ]},
   {"key":"location","title":"GPS location","titleAr":"الموقع الجغرافي","fields":[
     {"key":"latitude","label":"Latitude","labelAr":"خط العرض","type":"number","governanceKey":"latitude"},
     {"key":"longitude","label":"Longitude","labelAr":"خط الطول","type":"number","governanceKey":"longitude"}
   ]},
   {"key":"attachments","title":"Supporting documents","titleAr":"المستندات الداعمة","fields":[
     {"key":"documents","label":"Attachment","labelAr":"مرفق","type":"file"}
   ]},
   {"key":"request","title":"Request","titleAr":"الطلب","fields":[
     {"key":"reason","label":"Reason for change","labelAr":"سبب التغيير","type":"select","required":true,"options":[
       {"value":"moved","label":"Customer moved","labelAr":"انتقل العميل"},
       {"value":"correction","label":"Data correction","labelAr":"تصحيح بيانات"},
       {"value":"new_contact","label":"New contact person","labelAr":"مسؤول تواصل جديد"},
       {"value":"reclassification","label":"Re-classification / re-route","labelAr":"إعادة تصنيف / توجيه"},
       {"value":"other","label":"Other","labelAr":"أخرى"}
     ]},
     {"key":"reason_detail","label":"Details","labelAr":"تفاصيل","type":"text","required":true,"showWhen":{"field":"reason","equals":"other"}}
   ]}
 ]}'::jsonb
FROM erp_forms fo
WHERE v.form_id = fo.id
  AND fo.company_id IS NULL
  AND fo.code = 'customer_data_update'
  AND v.version = 1;

-- ── Rollback (manual): re-run 0241's seed schema. ───────────────────────────
