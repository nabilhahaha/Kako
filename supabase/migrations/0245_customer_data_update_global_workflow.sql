-- ============================================================================
-- 0245: Customer Data Update — global, event-triggered workflow (8F operational)
-- ----------------------------------------------------------------------------
-- Out-of-the-box execution with NO manual per-tenant instantiation: seed ONE
-- GLOBAL (company_id IS NULL) workflow definition + steps, active and triggered
-- by the 'customer_change_request.submitted' event the form submit emits. The
-- engine resolves a global definition for any tenant (erp_workflow_start falls
-- back to company_id IS NULL; listDefinitionsForEvent + RLS read globals when
-- visibility='global'), and instances are tenant-scoped. Mirrors the
-- customer_data_update template (0238/0239/0243) on the existing runtime — no new
-- engine semantics. Same precedent as the seeded customer_onboarding /
-- credit_limit_approval globals (0088/0089).
--
-- Inert end-to-end until KAKO_FORM_BUILDER: the only emitter of the trigger event
-- is the flag-gated form submit. Idempotent. Depends on 0176/0177 (step_type/
-- config + nullable approver_type), 0180 (status/visibility), 0240–0244.
-- ============================================================================

-- The global definition (active, published, globally visible, event-triggered).
INSERT INTO erp_workflow_definitions
  (company_id, key, entity, name_ar, name_en, is_active, status, visibility, trigger, trigger_event, trigger_config)
VALUES
  (NULL, 'customer_data_update', 'customer_change_request',
   'تحديث بيانات العميل', 'Customer Data Update',
   true, 'published', 'global', 'event', 'customer_change_request.submitted', '{}'::jsonb)
ON CONFLICT (company_id, key) DO UPDATE SET
  is_active = true, status = 'published', visibility = 'global',
  trigger = 'event', trigger_event = EXCLUDED.trigger_event, entity = EXCLUDED.entity;

-- Steps mirror the template's apply flow (approval → apply to customer → mark
-- approved → notify). System steps carry NULL approver_type (CHECK passes on NULL).
INSERT INTO erp_workflow_steps
  (definition_id, step_no, step_type, name, name_ar, name_en, approver_type, approver_ref, mode, required_approvals, sla_hours, escalate_to, config)
SELECT d.id, s.step_no, s.step_type, s.name, s.name_ar, s.name_en, s.approver_type, s.approver_ref, s.mode, s.required_approvals, s.sla_hours, s.escalate_to, s.config
FROM erp_workflow_definitions d
CROSS JOIN (VALUES
  (1, 'approval',      'Supervisor review',            'مراجعة المشرف',       'Supervisor review',       'role',        'supervisor', 'sequential', 1, 24,   'manager', '{"form_code":"customer_data_update"}'::jsonb),
  (2, 'update_record', 'Apply approved changes',       'تطبيق التعديلات',     'Apply approved changes',  NULL::text,    NULL::text,   'sequential', 1, NULL::int, NULL::text, '{"table":"erp_customers","patch_from_context":"changes","id_from_context":"customer_id"}'::jsonb),
  (3, 'update_record', 'Mark request approved',        'تحديث حالة الطلب',    'Mark request approved',   NULL::text,    NULL::text,   'sequential', 1, NULL::int, NULL::text, '{"table":"erp_customer_change_requests","patch":{"status":"approved"}}'::jsonb),
  (4, 'notification',  'Notify requester',             'إشعار صاحب الطلب',    'Notify requester',        NULL::text,    NULL::text,   'sequential', 1, NULL::int, NULL::text, '{"channel":"in_app","template":"customer_update_approved","to":"requester"}'::jsonb)
) AS s(step_no, step_type, name, name_ar, name_en, approver_type, approver_ref, mode, required_approvals, sla_hours, escalate_to, config)
WHERE d.key = 'customer_data_update' AND d.company_id IS NULL
ON CONFLICT (definition_id, step_no) DO NOTHING;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DELETE FROM erp_workflow_steps WHERE definition_id IN
--   (SELECT id FROM erp_workflow_definitions WHERE key='customer_data_update' AND company_id IS NULL);
-- DELETE FROM erp_workflow_definitions WHERE key='customer_data_update' AND company_id IS NULL;
