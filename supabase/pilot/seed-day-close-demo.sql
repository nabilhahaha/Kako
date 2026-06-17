-- End Day Approval & Settlement — demo enablement (staging).
-- Applied to "Nile FMCG (DEMO)" (company 60995681-9fc8-4969-a4e1-998a1bfe9fe6).
-- Real-distribution model: Supervisor Review CLOSES the day; cash settlement and
-- weekly inventory reconciliation are INDEPENDENT, non-blocking tracks with cash
-- carry-forward. Re-runnable (flags upsert, policy upsert).

\set co '60995681-9fc8-4969-a4e1-998a1bfe9fe6'

-- 1) Capabilities ON.
INSERT INTO erp_feature_flags(company_id, feature_key, enabled)
SELECT :'co'::uuid, k, true
FROM (VALUES ('platform.day_close_approval'), ('platform.day_close_sla')) AS f(k)
ON CONFLICT (company_id, feature_key) DO UPDATE SET enabled = excluded.enabled;

-- 2) Policy: operational close via Supervisor; settlement (Cashier) + weekly
--    reconciliation (Warehouse) independent, non-blocking; partial + carry-forward on.
INSERT INTO erp_day_close_policies(
  company_id, mode,
  supervisor_enabled, supervisor_role,
  settle_enabled, settle_role, settle_blocks_close, allow_partial_settlement, auto_carry_forward,
  reconcile_enabled, reconcile_role, reconcile_blocks_close, reconcile_cadence,
  stage_order, separation_of_duties)
VALUES (
  :'co'::uuid, 'custom',
  true, 'supervisor',
  true, 'cashier', false, true, true,
  true, 'warehouse_keeper', false, 'weekly',
  ARRAY['supervisor','reconcile','settle'], false)
ON CONFLICT (company_id) DO UPDATE SET
  mode = excluded.mode,
  supervisor_enabled = excluded.supervisor_enabled, supervisor_role = excluded.supervisor_role,
  settle_enabled = excluded.settle_enabled, settle_role = excluded.settle_role,
  settle_blocks_close = excluded.settle_blocks_close, allow_partial_settlement = excluded.allow_partial_settlement,
  auto_carry_forward = excluded.auto_carry_forward,
  reconcile_enabled = excluded.reconcile_enabled, reconcile_role = excluded.reconcile_role,
  reconcile_blocks_close = excluded.reconcile_blocks_close, reconcile_cadence = excluded.reconcile_cadence,
  separation_of_duties = excluded.separation_of_duties, updated_at = now();

-- Enterprises that must hand over cash / count stock before closing set:
--   UPDATE erp_day_close_policies SET settle_blocks_close = true, reconcile_blocks_close = true WHERE company_id = :'co';
