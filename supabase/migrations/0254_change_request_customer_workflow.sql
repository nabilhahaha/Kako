-- ============================================================================
-- 0254: Change Request engine — Phase 3: customer approval workflow (global)
-- ----------------------------------------------------------------------------
-- Seeds ONE GLOBAL (company_id IS NULL) workflow definition that the engine
-- auto-starts when a customer change request is submitted. Reuses the existing
-- engine end-to-end (erp_workflow_start / decide / runtime). The generic
-- `change_request.submitted` event carries entity_key in its payload; the
-- definition's trigger_config `where:{entity_key:customer}` selects ONLY this
-- entity's flow (matchesTrigger payload filter), so every entity gets its own
-- definition off one event type — metadata-driven, no per-entity engine code.
--
-- Steps: approval (permission customers.approve) → mark the request approved →
-- notify the requester. The master-data APPLY (writing erp_customers, bulk,
-- effective-dating) is added in Phase 4 via erp_change_request_apply; this phase
-- wires approval + status + notification only. Companies override by publishing a
-- company-scoped definition with the same key (existing global-vs-company
-- resolution) — that is how multi-level / company-specific approval rules work.
--
-- Additive, INERT until KAKO_CHANGE_REQUESTS (the only emitter is the flag-gated
-- submit action). Idempotent. Mirrors 0245.
-- ============================================================================

INSERT INTO erp_workflow_definitions
  (company_id, key, entity, name_ar, name_en, is_active, status, visibility, trigger, trigger_event, trigger_config)
VALUES
  (NULL, 'change_request:customer', 'change_request',
   'طلب تغيير بيانات العميل', 'Customer change request',
   true, 'published', 'global', 'event', 'change_request.submitted',
   '{"where":{"entity_key":"customer"}}'::jsonb)
ON CONFLICT (company_id, key) DO UPDATE SET
  is_active = true, status = 'published', visibility = 'global',
  trigger = 'event', trigger_event = EXCLUDED.trigger_event,
  trigger_config = EXCLUDED.trigger_config, entity = EXCLUDED.entity;

INSERT INTO erp_workflow_steps
  (definition_id, step_no, step_type, name, name_ar, name_en, approver_type, approver_ref, mode, required_approvals, sla_hours, escalate_to, config)
SELECT d.id, s.step_no, s.step_type, s.name, s.name_ar, s.name_en, s.approver_type, s.approver_ref, s.mode, s.required_approvals, s.sla_hours, s.escalate_to, s.config
FROM erp_workflow_definitions d
CROSS JOIN (VALUES
  (1, 'approval',      'Approve change request', 'اعتماد طلب التغيير', 'Approve change request', 'permission', 'customers.approve', 'sequential', 1, 24,        'manager', '{}'::jsonb),
  (2, 'update_record', 'Mark request approved',  'تحديث حالة الطلب',   'Mark request approved',  NULL::text,   NULL::text,          'sequential', 1, NULL::int, NULL::text, '{"table":"erp_change_requests","patch":{"status":"approved"}}'::jsonb),
  (3, 'notification',  'Notify requester',       'إشعار صاحب الطلب',   'Notify requester',       NULL::text,   NULL::text,          'sequential', 1, NULL::int, NULL::text, '{"channel":"in_app","template":"change_request_decided","to":"requester"}'::jsonb)
) AS s(step_no, step_type, name, name_ar, name_en, approver_type, approver_ref, mode, required_approvals, sla_hours, escalate_to, config)
WHERE d.key = 'change_request:customer' AND d.company_id IS NULL
ON CONFLICT (definition_id, step_no) DO NOTHING;

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- DELETE FROM erp_workflow_steps WHERE definition_id IN
--   (SELECT id FROM erp_workflow_definitions WHERE key='change_request:customer' AND company_id IS NULL);
-- DELETE FROM erp_workflow_definitions WHERE key='change_request:customer' AND company_id IS NULL;
