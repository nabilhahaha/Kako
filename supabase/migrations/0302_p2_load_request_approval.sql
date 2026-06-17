-- ============================================================================
-- 0302: P2 — Load Request approval on the engine (flagged, dormant)
-- ----------------------------------------------------------------------------
-- ADDITIVE + idempotent + DORMANT. Seeds the branch-scoped, governance-flagged
-- definition for stock/load requests. Used ONLY when KAKO_APPROVAL_LOADREQ is on
-- (default OFF) — until then the legacy /inventory/requests approve/reject path
-- is unchanged. Approver: any in-branch holder of stock_request.approve. The
-- 'stock_request' outcome handler calls the existing erp_approve_stock_request
-- RPC on approve (so the proven stock-movement logic is reused).
--
-- Rollback: delete the definition by key (steps cascade); flag off.
-- ============================================================================
insert into erp_workflow_definitions
  (company_id, key, entity, name_ar, name_en, trigger, is_active, block_self_approval, require_reject_reason, status)
select null, 'stock_request_approval', 'stock_request',
       'اعتماد طلب تحميل', 'Load request approval', 'manual', true, true, true, 'published'
where not exists (select 1 from erp_workflow_definitions where company_id is null and key = 'stock_request_approval');

insert into erp_workflow_steps
  (definition_id, step_no, name_ar, name_en, approver_type, approver_ref, mode, required_approvals, branch_scoped, sla_hours, escalate_to)
select d.id, 1, 'اعتماد المخزن', 'Warehouse approver', 'permission', 'stock_request.approve', 'sequential', 1, true, 24, 'company_admin'
  from erp_workflow_definitions d
 where d.company_id is null and d.key = 'stock_request_approval'
   and not exists (select 1 from erp_workflow_steps s where s.definition_id = d.id and s.step_no = 1);
