-- ============================================================================
-- 0253: Change Request engine — Phase 2: register `customer` as reference entity
-- ----------------------------------------------------------------------------
-- Seeds the GLOBAL document-type catalog and the GLOBAL `customer` entity into
-- the metadata registry (company_id NULL = platform default, readable by every
-- tenant; a company may override with its own row). This is pure METADATA — no
-- engine code is entity-specific. INERT until KAKO_CHANGE_REQUESTS. Idempotent.
--
-- allowed_fields is an explicit safety whitelist (the confirmed sensitive
-- customer columns) so a request can never propose a change to id/company_id or
-- other system columns. Validation rules are declarative; they only fire when the
-- field is actually being changed. The legacy erp_customer_change_requests flow
-- is untouched (absorbed in a later phase).
-- ============================================================================

-- ── Global document-type catalog ────────────────────────────────────────────
INSERT INTO erp_change_request_doc_types (company_id, doc_key, label_en, label_ar) VALUES
  (NULL, 'cr_copy',          'Commercial registration copy', 'صورة السجل التجاري'),
  (NULL, 'vat_certificate',  'VAT certificate',              'شهادة ضريبة القيمة المضافة'),
  (NULL, 'national_address', 'National address',             'العنوان الوطني'),
  (NULL, 'photo',            'Photo',                        'صورة'),
  (NULL, 'contract',         'Contract',                     'عقد'),
  (NULL, 'approval_doc',     'Approval document',            'مستند اعتماد')
ON CONFLICT (doc_key) WHERE company_id IS NULL DO NOTHING;

-- ── Global `customer` entity (reference implementation) ─────────────────────
INSERT INTO erp_change_request_entities (
  company_id, entity_key, target_table, id_column, label_en, label_ar,
  create_permission, approve_permission, workflow_key,
  allowed_fields, validation, attachment_types,
  supports_effective_dating, supports_bulk, bulk_max, notification_template, is_active
) VALUES (
  NULL, 'customer', 'erp_customers', 'id', 'Customer', 'العميل',
  'customers.manage', 'customers.approve', NULL,          -- NULL → workflow key change_request:customer
  '["cr_number","tax_number","credit_limit","channel_id","segment_id","classification_id","payment_terms_days"]'::jsonb,
  '{"rules":[
      {"field":"tax_number","regex":"^3[0-9]{14}$"},
      {"field":"credit_limit","type":"number","min":0},
      {"field":"payment_terms_days","type":"number","min":0,"max":365}
   ]}'::jsonb,
  '["cr_copy","vat_certificate","national_address"]'::jsonb,
  true, true, 1000, 'change_request_decided', true
)
ON CONFLICT (entity_key) WHERE company_id IS NULL DO NOTHING;

-- ── Rollback (manual):
--   DELETE FROM erp_change_request_entities WHERE company_id IS NULL AND entity_key='customer';
--   DELETE FROM erp_change_request_doc_types WHERE company_id IS NULL
--     AND doc_key IN ('cr_copy','vat_certificate','national_address','photo','contract','approval_doc');
