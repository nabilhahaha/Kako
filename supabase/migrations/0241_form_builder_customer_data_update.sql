-- ============================================================================
-- 0241: Form Builder (8F-2) — seed the global Customer Data Update form +
--       reference it from the customer_data_update workflow template
-- ----------------------------------------------------------------------------
-- 8F-2 ships the renderer + governance binding + offline submission. This seeds
-- the platform-global "Customer Data Update" form (company_id IS NULL, readable by
-- every tenant) with a PUBLISHED v1 schema, and attaches the form reference
-- (config.form_code) to the existing customer_data_update workflow template's
-- review step — so the approval that reviews a change request renders that form.
--
-- The schema jsonb mirrors customerDataUpdateForm() in src/lib/form-builder/forms.ts
-- (the integration test asserts it is present + valid). Contact fields bind to the
-- customer entity's governed fields via governanceKey → access resolves through the
-- single field-governance path. Additive + INERT until KAKO_FORM_BUILDER.
-- Depends on 0240 (form tables) + 0238/0239 (workflow templates).
-- ============================================================================

-- Seed the global form + its published v1 (idempotent on the global code).
WITH f AS (
  INSERT INTO erp_forms (company_id, code, name_en, name_ar, entity)
  VALUES (NULL, 'customer_data_update', 'Customer Data Update', 'تحديث بيانات العميل', 'customer')
  ON CONFLICT (code) WHERE company_id IS NULL
    DO UPDATE SET name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar, entity = EXCLUDED.entity
  RETURNING id
)
INSERT INTO erp_form_versions (company_id, form_id, version, schema, status, published_at)
SELECT NULL, f.id, 1,
  '{"sections":[
     {"key":"contact","title":"Contact details","titleAr":"بيانات التواصل","fields":[
       {"key":"phone","label":"Phone","labelAr":"الهاتف","type":"text","governanceKey":"phone"},
       {"key":"email","label":"Email","labelAr":"البريد","type":"text","governanceKey":"email"},
       {"key":"contact_person","label":"Contact person","labelAr":"مسؤول التواصل","type":"text","governanceKey":"contact_person"},
       {"key":"contact_phone","label":"Contact phone","labelAr":"هاتف التواصل","type":"text","governanceKey":"contact_phone"},
       {"key":"national_address","label":"National address","labelAr":"العنوان الوطني","type":"text","governanceKey":"national_address"}
     ]},
     {"key":"request","title":"Request","titleAr":"الطلب","fields":[
       {"key":"reason","label":"Reason for change","labelAr":"سبب التغيير","type":"select","required":true,"options":[
         {"value":"moved","label":"Customer moved","labelAr":"انتقل العميل"},
         {"value":"correction","label":"Data correction","labelAr":"تصحيح بيانات"},
         {"value":"new_contact","label":"New contact person","labelAr":"مسؤول تواصل جديد"},
         {"value":"other","label":"Other","labelAr":"أخرى"}
       ]},
       {"key":"reason_detail","label":"Details","labelAr":"تفاصيل","type":"text","required":true,"showWhen":{"field":"reason","equals":"other"}}
     ]}
   ]}'::jsonb,
  'published', now()
FROM f
ON CONFLICT (form_id, version) DO NOTHING;

-- Attach the form reference to the workflow template's review step (step 1). The
-- engine ignores unknown config keys; the form layer reads config.form_code to
-- render/attach the form for that step. Idempotent (sets the same value).
UPDATE erp_workflow_templates
SET definition = jsonb_set(definition, '{steps,0,config,form_code}', '"customer_data_update"'::jsonb, true)
WHERE company_id IS NULL
  AND code = 'customer_data_update'
  AND definition #> '{steps,0,config}' IS NOT NULL;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DELETE FROM erp_form_versions WHERE form_id IN (SELECT id FROM erp_forms WHERE code='customer_data_update' AND company_id IS NULL);
-- DELETE FROM erp_forms WHERE code='customer_data_update' AND company_id IS NULL;
-- UPDATE erp_workflow_templates SET definition = definition #- '{steps,0,config,form_code}'
--   WHERE company_id IS NULL AND code='customer_data_update';
