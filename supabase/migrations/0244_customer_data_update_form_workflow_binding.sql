-- ============================================================================
-- 0244: Customer Data Update — form-level workflow binding (8F operational)
-- ----------------------------------------------------------------------------
-- Moves workflow start onto the SINGLE submit path: the form schema now declares
-- a `workflow` binding, so submitting the form (online OR offline-on-sync) opens
-- the change request and emits 'customer_change_request.submitted' generically —
-- no form-specific server action, and offline submissions route through the
-- workflow on sync exactly like online ones. Mirrors customerDataUpdateForm() in
-- src/lib/form-builder/forms.ts. Idempotent. Depends on 0240/0241/0242.
-- ============================================================================

UPDATE erp_form_versions v
SET schema = jsonb_set(
  v.schema,
  '{workflow}',
  '{"changeRequestTable":"erp_customer_change_requests","targetIdField":"customer_id","changeEntity":"customer_change_request","eventType":"customer_change_request.submitted","reasonField":"reason"}'::jsonb,
  true
)
FROM erp_forms fo
WHERE v.form_id = fo.id
  AND fo.company_id IS NULL
  AND fo.code = 'customer_data_update'
  AND v.version = 1;

-- ── Rollback (manual): UPDATE … SET schema = v.schema #- '{workflow}' … ──────
