-- ============================================================================
-- 0239: Workflow Builder — correct seeded demo-template step configs (8A)
-- ----------------------------------------------------------------------------
-- The engine's notification executor REQUIRES config.template (+ channel), and
-- condition steps need a real expression to branch. The 0238 seeds set channel
-- only / empty conditions, so an instantiated→published demo workflow would fail
-- validation or branch trivially. This corrects the 3 global demo templates'
-- definition jsonb so they are publishable + meaningful on the existing engine:
--   - notification steps gain config.template (+ to) ;
--   - the over-cap / expiry condition steps gain {when, op, value} expressions
--     (the shape erp condition-eval understands).
-- Idempotent (full definition replace, keyed by global code). Additive data fix;
-- no schema change. Depends on 0238.
-- ============================================================================

UPDATE erp_workflow_templates SET definition =
  '{"entity":"customer_change_request","trigger":"manual","steps":[
     {"stepNo":1,"stepType":"approval","name":"Supervisor review","approverType":"role","approverRef":"supervisor","mode":"sequential","requiredApprovals":1,"slaHours":24,"escalateTo":"manager","config":{}},
     {"stepNo":2,"stepType":"update_record","name":"Apply approved changes","approverType":"system","approverRef":null,"mode":"sequential","requiredApprovals":0,"slaHours":null,"escalateTo":null,"config":{"table":"erp_customer_change_requests","patch":{"status":"approved"}}},
     {"stepNo":3,"stepType":"notification","name":"Notify requester","approverType":"system","approverRef":null,"mode":"sequential","requiredApprovals":0,"slaHours":null,"escalateTo":null,"config":{"channel":"in_app","template":"customer_update_approved","to":"requester"}}
   ]}'::jsonb
 WHERE company_id IS NULL AND code = 'customer_data_update';

UPDATE erp_workflow_templates SET definition =
  '{"entity":"inventory_expiry","trigger":"manual","steps":[
     {"stepNo":1,"stepType":"condition","name":"Within expiry threshold","approverType":"system","approverRef":null,"mode":"sequential","requiredApprovals":0,"slaHours":null,"escalateTo":null,"config":{"when":"days_to_expiry","op":"lte","value":"30"}},
     {"stepNo":2,"stepType":"approval","name":"Warehouse manager approval","approverType":"role","approverRef":"manager","mode":"sequential","requiredApprovals":1,"slaHours":48,"escalateTo":"admin","config":{}},
     {"stepNo":3,"stepType":"notification","name":"Notify stock controller","approverType":"system","approverRef":null,"mode":"sequential","requiredApprovals":0,"slaHours":null,"escalateTo":null,"config":{"channel":"in_app","template":"expiry_approved","to":"role:warehouse"}}
   ]}'::jsonb
 WHERE company_id IS NULL AND code = 'old_expiry_approval';

UPDATE erp_workflow_templates SET definition =
  '{"entity":"trade_promotion","trigger":"manual","steps":[
     {"stepNo":1,"stepType":"approval","name":"Sales manager approval","approverType":"role","approverRef":"manager","mode":"sequential","requiredApprovals":1,"slaHours":24,"escalateTo":"admin","config":{}},
     {"stepNo":2,"stepType":"condition","name":"Above cap -> finance","approverType":"system","approverRef":null,"mode":"sequential","requiredApprovals":0,"slaHours":null,"escalateTo":null,"config":{"when":"amount","op":"gt","value":"10000"}},
     {"stepNo":3,"stepType":"approval","name":"Finance approval (over cap)","approverType":"role","approverRef":"accountant","mode":"sequential","requiredApprovals":1,"slaHours":48,"escalateTo":"admin","config":{}},
     {"stepNo":4,"stepType":"notification","name":"Notify requester","approverType":"system","approverRef":null,"mode":"sequential","requiredApprovals":0,"slaHours":null,"escalateTo":null,"config":{"channel":"in_app","template":"trade_spend_decided","to":"requester"}}
   ]}'::jsonb
 WHERE company_id IS NULL AND code = 'trade_spend_approval';

-- ── Rollback (manual): re-run 0238's seed values. ───────────────────────────
