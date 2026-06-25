-- ============================================================================
-- 0386: Route Planner — performance pass for large datasets (ADDITIVE indexes only).
--
-- The Mission Builder (PR-5) searches a saved dataset's customers by code/name/city with
-- ILIKE '%term%'. The existing btree indexes (dataset_id, seq) / (dataset_id, code) serve the
-- ordered paging and exact-prefix paths, but a substring ILIKE on name/city is unindexed and
-- becomes a scan for very large single datasets (the live data already holds 41k customer
-- rows). pg_trgm is already enabled on the project, so we add GIN trigram indexes to make the
-- substring search index-assisted at scale.
--
-- The mission tables (erp_rp_missions / erp_rp_mission_stops / erp_rp_mission_events) are
-- already covered by 0363's hot-path composites (company_id+mission_date, assigned_to+status,
-- mission_id+seq), so no new mission indexes are needed.
--
-- CREATE INDEX IF NOT EXISTS only — additive, no data change, no destructive SQL, no RLS
-- change, no Field Verification impact. Safe to re-run.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_rp_dsc_name_trgm
  ON erp_rp_dataset_customers USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_rp_dsc_code_trgm
  ON erp_rp_dataset_customers USING gin (code gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_rp_dsc_city_trgm
  ON erp_rp_dataset_customers USING gin (city gin_trgm_ops);

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS idx_rp_dsc_name_trgm;
-- DROP INDEX IF EXISTS idx_rp_dsc_code_trgm;
-- DROP INDEX IF EXISTS idx_rp_dsc_city_trgm;
