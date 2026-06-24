-- ============================================================================
-- 0372: Field Verification — Customer Lists management (archive / restore /
-- replace / delete-unverified). ADDITIVE + SAFE:
--   * erp_rp_datasets gains a soft archive state (status + archived_at/by) and an
--     optional replaced_by lineage link. Defaulted to 'active' so every existing
--     list keeps today's behavior; reps simply stop seeing a list once archived.
--   * SECURITY DEFINER helpers for the admin screen:
--       - erp_fv_dataset_stats()      → per-list total / assigned reps / completed
--       - erp_fv_unverified_count(ds) → exact deletable (no-verification) count
--       - erp_fv_delete_unverified(ds)→ delete ONLY rows with NO verification
--     The delete uses a NOT EXISTS guard, so a customer that has ANY verification
--     (completed history / photos / reports / audit) can NEVER be deleted — even
--     though erp_rp_customer_verifications.customer_id is ON DELETE CASCADE.
-- No destructive change, no data rewrite. Safe to re-run.
-- ============================================================================

-- Soft archive state on the uploaded list ------------------------------------
ALTER TABLE erp_rp_datasets
  ADD COLUMN IF NOT EXISTS status      text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES erp_profiles(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS replaced_by uuid REFERENCES erp_rp_datasets(id) ON DELETE SET NULL;

ALTER TABLE erp_rp_datasets DROP CONSTRAINT IF EXISTS rp_ds_status_chk;
ALTER TABLE erp_rp_datasets ADD CONSTRAINT rp_ds_status_chk CHECK (status IN ('active','archived'));

CREATE INDEX IF NOT EXISTS idx_rp_datasets_company_status ON erp_rp_datasets (company_id, status);

-- Per-list stats for the admin screen (caller's company only) -----------------
CREATE OR REPLACE FUNCTION erp_fv_dataset_stats()
RETURNS TABLE (dataset_id uuid, total_customers int, assigned_reps int, completed int)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    d.id,
    (SELECT count(*)::int FROM erp_rp_dataset_customers c WHERE c.dataset_id = d.id),
    (SELECT count(DISTINCT c.salesman)::int FROM erp_rp_dataset_customers c
       WHERE c.dataset_id = d.id AND c.salesman IS NOT NULL AND btrim(c.salesman) <> ''),
    (SELECT count(*)::int FROM erp_rp_customer_verifications v WHERE v.dataset_id = d.id)
  FROM erp_rp_datasets d
  WHERE d.company_id = erp_user_company_id();
$$;

-- Exact count of deletable (no-verification) customers in a list --------------
CREATE OR REPLACE FUNCTION erp_fv_unverified_count(p_dataset_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(*)::int
  FROM erp_rp_dataset_customers c
  WHERE c.dataset_id = p_dataset_id
    AND c.company_id = erp_user_company_id()
    AND NOT EXISTS (SELECT 1 FROM erp_rp_customer_verifications v WHERE v.customer_id = c.id);
$$;

-- Delete ONLY unverified customers in a list (company admin). Returns the count.
-- The NOT EXISTS guard makes deleting a customer with any verification impossible.
CREATE OR REPLACE FUNCTION erp_fv_delete_unverified(p_dataset_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid;
  v_deleted int;
BEGIN
  SELECT company_id INTO v_company FROM erp_rp_datasets WHERE id = p_dataset_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'dataset not found';
  END IF;
  IF NOT (erp_is_platform_owner()
          OR (v_company = erp_user_company_id() AND erp_is_company_admin(v_company))) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  DELETE FROM erp_rp_dataset_customers c
   WHERE c.dataset_id = p_dataset_id
     AND c.company_id = v_company
     AND NOT EXISTS (SELECT 1 FROM erp_rp_customer_verifications v WHERE v.customer_id = c.id);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END $$;

REVOKE ALL ON FUNCTION erp_fv_dataset_stats()             FROM public;
REVOKE ALL ON FUNCTION erp_fv_unverified_count(uuid)      FROM public;
REVOKE ALL ON FUNCTION erp_fv_delete_unverified(uuid)     FROM public;
GRANT EXECUTE ON FUNCTION erp_fv_dataset_stats()          TO authenticated;
GRANT EXECUTE ON FUNCTION erp_fv_unverified_count(uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION erp_fv_delete_unverified(uuid)  TO authenticated;
