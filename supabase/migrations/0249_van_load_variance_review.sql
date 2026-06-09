-- ============================================================================
-- 0249: Van Sales (Phase B) — load-variance review workflow
-- ----------------------------------------------------------------------------
-- When a salesman confirms a load with a variance (short / damaged / wrong /
-- expiry / other, or a full reject), the confirmation sets requires_review and the
-- app emits 'van_load_variance.raised'. This GLOBAL, event-triggered workflow runs
-- the review on the EXISTING engine: Warehouse review → Supervisor approval → mark
-- the confirmation reviewed (update_record review_status='approved'). NO automatic
-- stock/financial deduction — the review records responsibility; any corrective
-- movement is a separate, controlled adjustment. Configurable per company (clone +
-- edit in the Workflow Builder). Role-based steps. Mirrors 0245/0248. Additive;
-- INERT until KAKO_VAN_SALES. Depends on 0176/0180/0246.
-- ============================================================================

INSERT INTO erp_workflow_definitions
  (company_id, key, entity, name_ar, name_en, is_active, status, visibility, trigger, trigger_event, trigger_config)
VALUES
  (NULL, 'van_load_variance', 'van_load_variance',
   'مراجعة فروقات التحميل', 'Van Load Variance Review',
   true, 'published', 'global', 'event', 'van_load_variance.raised', '{}'::jsonb)
ON CONFLICT (company_id, key) DO UPDATE SET
  is_active = true, status = 'published', visibility = 'global',
  trigger = 'event', trigger_event = EXCLUDED.trigger_event, entity = EXCLUDED.entity;

INSERT INTO erp_workflow_steps
  (definition_id, step_no, step_type, name, name_ar, name_en, approver_type, approver_ref, mode, required_approvals, sla_hours, escalate_to, config)
SELECT d.id, s.step_no, s.step_type, s.name, s.name_ar, s.name_en, s.approver_type, s.approver_ref, s.mode, s.required_approvals, s.sla_hours, s.escalate_to, s.config
FROM erp_workflow_definitions d
CROSS JOIN (VALUES
  (1, 'approval',      'Warehouse review',   'مراجعة المستودع',  'Warehouse review',   'role',     'warehouse_keeper', 'sequential', 1, 24,        'manager', '{}'::jsonb),
  (2, 'approval',      'Supervisor approval','اعتماد المشرف',     'Supervisor approval', 'role',     'supervisor',       'sequential', 1, 24,        'manager', '{}'::jsonb),
  (3, 'update_record', 'Mark reviewed',      'إنهاء المراجعة',    'Mark reviewed',       NULL::text, NULL::text,        'sequential', 1, NULL::int, NULL::text, '{"table":"erp_van_load_confirmations","patch":{"review_status":"approved"}}'::jsonb)
) AS s(step_no, step_type, name, name_ar, name_en, approver_type, approver_ref, mode, required_approvals, sla_hours, escalate_to, config)
WHERE d.key = 'van_load_variance' AND d.company_id IS NULL
ON CONFLICT (definition_id, step_no) DO NOTHING;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DELETE FROM erp_workflow_steps WHERE definition_id IN
--   (SELECT id FROM erp_workflow_definitions WHERE key='van_load_variance' AND company_id IS NULL);
-- DELETE FROM erp_workflow_definitions WHERE key='van_load_variance' AND company_id IS NULL;
