-- ============================================================================
-- 0298: P1 — activate Credit-Limit / Trade-Spend / Price-Change on the engine
-- ----------------------------------------------------------------------------
-- Seeds three GLOBAL configurable workflow definitions (company_id null) with
-- the governance foundation (0296 permission resolution + 0297 enforcement):
-- permission-based approvers, amount thresholds, block_self_approval and
-- require_reject_reason. ADDITIVE + idempotent (WHERE NOT EXISTS). These are
-- DORMANT: the app only routes a request to them when its P1 feature flag is on
-- (KAKO_APPROVAL_CREDIT / _TRADE_SPEND / _PRICE_CHANGE, default OFF). The legacy
-- 'credit_limit_approval' definition is left intact for the flag-off path.
--
-- Rollback: delete the three definitions by key (their steps cascade); set the
-- flags off. No existing data is touched.
-- ============================================================================

-- ── Credit-Limit (v2): base permission approver + senior co-sign over 5,000 ──
insert into erp_workflow_definitions
  (company_id, key, entity, name_ar, name_en, trigger, is_active, block_self_approval, require_reject_reason, status)
select null, 'credit_limit_approval_v2', 'credit_limit_request',
       'اعتماد حد ائتمان (محسّن)', 'Credit limit approval (v2)', 'manual', true, true, true, 'published'
where not exists (select 1 from erp_workflow_definitions where company_id is null and key = 'credit_limit_approval_v2');

insert into erp_workflow_steps
  (definition_id, step_no, name_ar, name_en, approver_type, approver_ref, mode, required_approvals, condition, sla_hours, escalate_to)
select d.id, 1, 'موافقة الائتمان', 'Credit approver', 'permission', 'credit.request.approve', 'sequential', 1, null, 24, 'company_admin'
  from erp_workflow_definitions d
 where d.company_id is null and d.key = 'credit_limit_approval_v2'
   and not exists (select 1 from erp_workflow_steps s where s.definition_id = d.id and s.step_no = 1);

insert into erp_workflow_steps
  (definition_id, step_no, name_ar, name_en, approver_type, approver_ref, mode, required_approvals, condition, sla_hours, escalate_to)
select d.id, 2, 'مراجعة الإدارة العليا', 'Senior co-sign', 'company_admin', null, 'sequential', 1,
       '{"when":"amount","op":"gt","value":"5000"}'::jsonb, 24, null
  from erp_workflow_definitions d
 where d.company_id is null and d.key = 'credit_limit_approval_v2'
   and not exists (select 1 from erp_workflow_steps s where s.definition_id = d.id and s.step_no = 2);

-- ── Trade-Spend: single level, any holder of pricing.manage ─────────────────
-- (pricing.manage is the granted permission; it alias-covers the granular
--  pricing.rule.edit that the legacy direct action checks via can().)
insert into erp_workflow_definitions
  (company_id, key, entity, name_ar, name_en, trigger, is_active, block_self_approval, require_reject_reason, status)
select null, 'trade_spend_approval', 'trade_promotion',
       'اعتماد إنفاق تجاري', 'Trade spend approval', 'manual', true, true, true, 'published'
where not exists (select 1 from erp_workflow_definitions where company_id is null and key = 'trade_spend_approval');

insert into erp_workflow_steps
  (definition_id, step_no, name_ar, name_en, approver_type, approver_ref, mode, required_approvals, condition, sla_hours, escalate_to)
select d.id, 1, 'اعتماد الإنفاق التجاري', 'Trade-spend approver', 'permission', 'pricing.manage', 'sequential', 1, null, 48, 'company_admin'
  from erp_workflow_definitions d
 where d.company_id is null and d.key = 'trade_spend_approval'
   and not exists (select 1 from erp_workflow_steps s where s.definition_id = d.id and s.step_no = 1);

-- ── Price-Change: single level, any holder of pricing.manage ────────────────
insert into erp_workflow_definitions
  (company_id, key, entity, name_ar, name_en, trigger, is_active, block_self_approval, require_reject_reason, status)
select null, 'price_change_approval', 'price_change_request',
       'اعتماد تغيير سعر', 'Price change approval', 'manual', true, true, true, 'published'
where not exists (select 1 from erp_workflow_definitions where company_id is null and key = 'price_change_approval');

insert into erp_workflow_steps
  (definition_id, step_no, name_ar, name_en, approver_type, approver_ref, mode, required_approvals, condition, sla_hours, escalate_to)
select d.id, 1, 'اعتماد تغيير السعر', 'Pricing approver', 'permission', 'pricing.manage', 'sequential', 1, null, 24, 'company_admin'
  from erp_workflow_definitions d
 where d.company_id is null and d.key = 'price_change_approval'
   and not exists (select 1 from erp_workflow_steps s where s.definition_id = d.id and s.step_no = 1);
