-- ============================================================================
-- 0303: P2 — Day-Close / Visit / Customer-Transfer / Van-Transfer / Van-Recon
--       approval definitions on the engine (flagged, dormant)
-- ----------------------------------------------------------------------------
-- ADDITIVE + idempotent + DORMANT. Seeds the five operational field-workflow
-- definitions with governance flags (block_self_approval + require_reject_reason)
-- and branch scope where applicable. Each is used ONLY when its KAKO_APPROVAL_*
-- flag is on (all default OFF) — the legacy field-queue paths are unchanged until
-- then. Approvals reuse the existing decision RPCs as outcome handlers (the
-- proven logic), so activation changes WHO/WHERE a decision is made, not WHAT it
-- does. Customer-transfer is NOT branch-scoped (it is inherently cross-branch).
--
-- Rollback: delete the five definitions by key (steps cascade); flags OFF.
-- ============================================================================
do $$
declare
  r record;
  v_def uuid;
begin
  for r in (
    select * from (values
      ('day_close_approval',          'work_session',       'اعتماد إغلاق اليوم',   'Day-close exception approval', 'day.approve_close_exception', true),
      ('visit_compliance_approval',   'visit_compliance',   'اعتماد زيارة خارج الخط','Out-of-route visit approval',  'visit.approve_out_of_route',  true),
      ('customer_transfer_approval',  'customer_transfer',  'اعتماد نقل عميل',       'Customer transfer approval',   'customer.transfer',           false),
      ('van_transfer_approval',       'van_transfer',       'اعتماد تحويل مخزون',    'Van transfer approval',        'stock.transfer.approve',      true),
      ('van_reconciliation_approval', 'van_reconciliation', 'اعتماد تسوية العربة',   'Van reconciliation approval',  'reconciliation.approve',      true)
    ) as t(key, entity, name_ar, name_en, perm, branch_scoped)
  ) loop
    if not exists (select 1 from erp_workflow_definitions where company_id is null and key = r.key) then
      insert into erp_workflow_definitions
        (company_id, key, entity, name_ar, name_en, trigger, is_active, block_self_approval, require_reject_reason, status)
      values (null, r.key, r.entity, r.name_ar, r.name_en, 'manual', true, true, true, 'published')
      returning id into v_def;

      insert into erp_workflow_steps
        (definition_id, step_no, name_ar, name_en, approver_type, approver_ref, mode, required_approvals, branch_scoped, sla_hours, escalate_to)
      values (v_def, 1, 'اعتماد', 'Approver', 'permission', r.perm, 'sequential', 1, r.branch_scoped, 24, 'company_admin');
    end if;
  end loop;
end $$;
