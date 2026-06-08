-- ============================================================================
-- 0243: Customer Data Update — apply approved changes to the customer (8F-2)
-- ----------------------------------------------------------------------------
-- The customer_data_update workflow now applies the APPROVED, already-governed
-- change set back to erp_customers via the generic update_record dynamic-patch
-- source: config.patch_from_context reads the change set from the run context
-- (seeded from the 'customer_change_request.submitted' trigger payload), and
-- config.id_from_context targets the customer. No customer-specific executor,
-- no DB trigger — the engine stays the single orchestrator, reusable for any
-- governed entity (supplier/product/route/…).
--
-- Inserts the apply step (step 2) before the status flip; renumbers to a
-- contiguous 1..4 and keeps the approval step's form_code reference (0241).
-- Idempotent full-definition replace, keyed by the global code. Depends on
-- 0238/0239 (template) + 0240/0241 (form). Additive; INERT until KAKO_WORKFLOW_*.
-- ============================================================================

UPDATE erp_workflow_templates SET definition =
  '{"entity":"customer_change_request","trigger":"manual","steps":[
     {"stepNo":1,"stepType":"approval","name":"Supervisor review","approverType":"role","approverRef":"supervisor","mode":"sequential","requiredApprovals":1,"slaHours":24,"escalateTo":"manager","config":{"form_code":"customer_data_update"}},
     {"stepNo":2,"stepType":"update_record","name":"Apply approved changes to customer","approverType":"system","approverRef":null,"mode":"sequential","requiredApprovals":0,"slaHours":null,"escalateTo":null,"config":{"table":"erp_customers","patch_from_context":"changes","id_from_context":"customer_id"}},
     {"stepNo":3,"stepType":"update_record","name":"Mark request approved","approverType":"system","approverRef":null,"mode":"sequential","requiredApprovals":0,"slaHours":null,"escalateTo":null,"config":{"table":"erp_customer_change_requests","patch":{"status":"approved"}}},
     {"stepNo":4,"stepType":"notification","name":"Notify requester","approverType":"system","approverRef":null,"mode":"sequential","requiredApprovals":0,"slaHours":null,"escalateTo":null,"config":{"channel":"in_app","template":"customer_update_approved","to":"requester"}}
   ]}'::jsonb
 WHERE company_id IS NULL AND code = 'customer_data_update';

-- ── Rollback (manual): re-run 0239's customer_data_update definition. ────────
