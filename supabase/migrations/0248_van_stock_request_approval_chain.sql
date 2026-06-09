-- ============================================================================
-- 0248: Van Sales (Phase B) — load-request approval chain (configurable)
-- ----------------------------------------------------------------------------
-- A GLOBAL, event-triggered approval workflow for salesman/supervisor stock
-- (load) requests, on the EXISTING workflow engine — no separate approval system.
-- Submitting a request emits 'van_stock_request.submitted'; the chain runs
-- supervisor approval → mark the request approved (update_record) → notify. The
-- chain is CONFIGURABLE PER COMPANY: a tenant clones + edits this definition in
-- the Workflow Builder to insert Area-Manager and/or Warehouse approval steps
-- (Companies B/C/D in the design) — the engine resolves the company definition
-- first, else this global default. Role-based steps (no hardcoded users). The
-- approval only flips the request status; stock posts later, ONLY on salesman
-- load confirmation (0247). Same pattern as 0245. Additive; INERT until the
-- van-sales request emitter (KAKO_VAN_SALES). Depends on 0176/0180/0011.
-- ============================================================================

INSERT INTO erp_workflow_definitions
  (company_id, key, entity, name_ar, name_en, is_active, status, visibility, trigger, trigger_event, trigger_config)
VALUES
  (NULL, 'van_stock_request', 'van_stock_request',
   'اعتماد طلب تحميل الشاحنة', 'Van Load Request Approval',
   true, 'published', 'global', 'event', 'van_stock_request.submitted', '{}'::jsonb)
ON CONFLICT (company_id, key) DO UPDATE SET
  is_active = true, status = 'published', visibility = 'global',
  trigger = 'event', trigger_event = EXCLUDED.trigger_event, entity = EXCLUDED.entity;

-- Default chain (Company A): Supervisor → mark approved → notify. System steps
-- carry NULL approver_type (the CHECK passes on NULL).
INSERT INTO erp_workflow_steps
  (definition_id, step_no, step_type, name, name_ar, name_en, approver_type, approver_ref, mode, required_approvals, sla_hours, escalate_to, config)
SELECT d.id, s.step_no, s.step_type, s.name, s.name_ar, s.name_en, s.approver_type, s.approver_ref, s.mode, s.required_approvals, s.sla_hours, s.escalate_to, s.config
FROM erp_workflow_definitions d
CROSS JOIN (VALUES
  (1, 'approval',      'Supervisor approval',  'اعتماد المشرف',        'Supervisor approval',  'role',     'supervisor', 'sequential', 1, 24,        'manager', '{}'::jsonb),
  (2, 'update_record', 'Mark request approved','اعتماد الطلب',         'Mark request approved', NULL::text, NULL::text,  'sequential', 1, NULL::int, NULL::text, '{"table":"erp_stock_requests","patch":{"status":"approved"}}'::jsonb),
  (3, 'notification',  'Notify requester',     'إشعار مقدّم الطلب',     'Notify requester',     NULL::text, NULL::text,  'sequential', 1, NULL::int, NULL::text, '{"channel":"in_app","template":"van_load_request_approved","to":"requester"}'::jsonb)
) AS s(step_no, step_type, name, name_ar, name_en, approver_type, approver_ref, mode, required_approvals, sla_hours, escalate_to, config)
WHERE d.key = 'van_stock_request' AND d.company_id IS NULL
ON CONFLICT (definition_id, step_no) DO NOTHING;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DELETE FROM erp_workflow_steps WHERE definition_id IN
--   (SELECT id FROM erp_workflow_definitions WHERE key='van_stock_request' AND company_id IS NULL);
-- DELETE FROM erp_workflow_definitions WHERE key='van_stock_request' AND company_id IS NULL;
