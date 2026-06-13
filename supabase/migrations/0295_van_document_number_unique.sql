-- ============================================================================
-- 0295 — DATA INTEGRITY: branch-scoped uniqueness for van document numbers
-- ----------------------------------------------------------------------------
-- ROOT CAUSE (audit BL-5)
--   erp_stock_requests.request_number and erp_van_load_manifests.manifest_number
--   were generated client-side as VLR-/VDL-${Date.now()}-${Math.random()} with NO
--   unique constraint, so two field reps (the offline/concurrent case) could
--   silently persist DUPLICATE human-readable numbers — ambiguous van load
--   reconciliation. The companion code change re-points generation at the atomic
--   erp_next_number(branch_id, …) counter (STO-/VAN- prefixes); this migration adds
--   the DB backstop so any residual collision FAILS LOUDLY instead of duplicating.
--
-- SAFETY
--   • Additive: only creates indexes; no row/column/policy change.
--   • Idempotent: IF NOT EXISTS.
--   • Existing values are high-entropy (timestamp+random), so the indexes build
--     cleanly on current data.
--
-- REVERSAL
--   DROP INDEX IF EXISTS erp_stock_requests_number_scope_key;
--   DROP INDEX IF EXISTS erp_van_load_manifests_number_scope_key;
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS erp_stock_requests_number_scope_key
  ON erp_stock_requests (branch_id, request_number);

CREATE UNIQUE INDEX IF NOT EXISTS erp_van_load_manifests_number_scope_key
  ON erp_van_load_manifests (branch_id, manifest_number)
  WHERE manifest_number IS NOT NULL;
