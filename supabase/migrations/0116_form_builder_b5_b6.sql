-- ============================================================================
-- 0116: Dynamic Form & Workflow Builder — B5/B6 (submission processing + effects)
-- ----------------------------------------------------------------------------
-- B5 (submission processing) and B6 (effect handlers) are implemented in the
-- application layer — they reuse the generic engine's completion hook
-- (applyWorkflowOutcome) and run under the acting user's RLS, exactly like the
-- existing M4 request-type outcome handlers. The only schema this needs is a
-- safe target for the whitelisted `set_gps` effect: customer geo-capture.
--
-- Whitelisted B6 effects (safest first): record_only, update_field, set_gps,
-- create_customer. Higher-risk business effects (credit limits, pricing,
-- financial actions) are intentionally deferred to a later, higher-assurance
-- phase. Additive + idempotent.
-- ============================================================================

-- set_gps / update_field target: capture a customer's location (non-financial).
alter table erp_customers add column if not exists latitude  numeric(10,7);
alter table erp_customers add column if not exists longitude numeric(10,7);

-- ============================================================================
-- ROLLBACK (manual): drop erp_customers.latitude / erp_customers.longitude.
-- ============================================================================
