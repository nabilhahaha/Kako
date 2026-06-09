-- ============================================================================
-- 0255: Change Request engine — Phase 4: generic apply / execution layer
-- ----------------------------------------------------------------------------
-- erp_change_request_apply(request_id): the ONE generic, metadata-driven function
-- that applies an APPROVED request to its target master-data table. Entity-agnostic
-- (resolves target_table/id_column from the registry), allowlist-guarded, idempotent,
-- per-target + per-field with BEFORE/AFTER audit, and partial-failure tolerant.
-- Handles single and (already) bulk target sets; future-dated requests are parked
-- as 'scheduled' (the cron in Phase 6 applies them when due).
--
-- erp_change_request_run_due(): the sweep that applies every request that is ready
-- now (status 'approved'/'scheduled' with effective_at null or past). Driven by a
-- scheduler (same pattern as erp_workflow_tick); also callable directly.
--
-- SECURITY DEFINER (writes master data + stamps company from the request, not the
-- session) with a fixed search_path. Each field write casts the jsonb value to the
-- column's own type (robust coercion) and is scoped to the request's company_id.
-- Additive; INERT until KAKO_CHANGE_REQUESTS. Idempotent (re-applies only pending
-- targets). The apply allowlist mirrors the code-side CR_APPLY_ALLOWLIST.
-- ============================================================================

CREATE OR REPLACE FUNCTION erp_change_request_apply(p_request_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  r            erp_change_requests%ROWTYPE;
  v_table      text;
  v_idcol      text;
  v_allow      text[] := ARRAY['erp_customers'];   -- mirrors CR_APPLY_ALLOWLIST
  t            record;
  vrow         record;
  v_udt        text;
  v_old_row    jsonb;
  v_before     jsonb;
  v_after      jsonb;
  v_total      int := 0;
  v_applied    int := 0;
  v_failed     int := 0;
  v_final      text;
BEGIN
  SELECT * INTO r FROM erp_change_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'change request % not found', p_request_id; END IF;

  -- Idempotent / gate: only act on a ready request.
  IF r.status NOT IN ('approved', 'scheduled', 'applying') THEN
    RETURN r.status;
  END IF;

  -- Future-dated → park as scheduled; the due-sweep applies it later.
  IF r.effective_at IS NOT NULL AND r.effective_at > now() THEN
    UPDATE erp_change_requests SET status = 'scheduled' WHERE id = p_request_id AND status <> 'scheduled';
    RETURN 'scheduled';
  END IF;

  -- Resolve the entity's target table/id column (company override → global default).
  SELECT target_table, COALESCE(id_column, 'id') INTO v_table, v_idcol
  FROM erp_change_request_entities
  WHERE entity_key = r.entity_key AND (company_id = r.company_id OR company_id IS NULL) AND is_active
  ORDER BY (company_id IS NULL)   -- company-specific first
  LIMIT 1;
  IF v_table IS NULL THEN RAISE EXCEPTION 'change request entity % is not registered', r.entity_key; END IF;
  IF NOT (v_table = ANY(v_allow)) THEN RAISE EXCEPTION 'table % is not in the change-request apply allowlist', v_table; END IF;

  UPDATE erp_change_requests SET status = 'applying' WHERE id = p_request_id;

  FOR t IN SELECT * FROM erp_change_request_targets WHERE request_id = p_request_id AND status = 'pending' LOOP
    v_total := v_total + 1;
    BEGIN
      -- Snapshot the live row (for before-values + existence check), tenant-scoped.
      EXECUTE format('SELECT to_jsonb(x) FROM %I x WHERE x.%I::text = $1 AND x.company_id = $2', v_table, v_idcol)
        INTO v_old_row USING t.target_id, r.company_id;
      IF v_old_row IS NULL THEN
        UPDATE erp_change_request_targets SET status = 'failed', error = 'target_not_found' WHERE id = t.id;
        v_failed := v_failed + 1;
        CONTINUE;
      END IF;

      v_before := '{}'::jsonb;
      v_after  := '{}'::jsonb;

      -- Apply each governed field (shared value rows + this target's overrides),
      -- casting the jsonb value to the column's own type.
      FOR vrow IN
        SELECT field_key, new_value
        FROM erp_change_request_values
        WHERE request_id = p_request_id AND (target_id IS NULL OR target_id = t.target_id)
      LOOP
        SELECT udt_name INTO v_udt FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = v_table AND column_name = vrow.field_key;
        IF v_udt IS NULL THEN RAISE EXCEPTION 'field % is not a column of %', vrow.field_key, v_table; END IF;

        EXECUTE format('UPDATE %I SET %I = $1::%s WHERE %I::text = $2 AND company_id = $3',
                       v_table, vrow.field_key, v_udt, v_idcol)
          USING (vrow.new_value #>> '{}'), t.target_id, r.company_id;

        v_before := v_before || jsonb_build_object(vrow.field_key, v_old_row -> vrow.field_key);
        v_after  := v_after  || jsonb_build_object(vrow.field_key, vrow.new_value);
        -- Persist the captured before-value on the per-target value row (handy for lists).
        UPDATE erp_change_request_values
          SET old_value = v_old_row -> vrow.field_key
          WHERE request_id = p_request_id AND field_key = vrow.field_key AND target_id = t.target_id;
      END LOOP;

      PERFORM erp_log_audit('change_request.apply', 'change_request', p_request_id::text,
        jsonb_build_object('entity_key', r.entity_key, 'target_id', t.target_id, 'before', v_before, 'after', v_after),
        r.company_id);

      UPDATE erp_change_request_targets SET status = 'applied', applied_at = now() WHERE id = t.id;
      v_applied := v_applied + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE erp_change_request_targets SET status = 'failed', error = left(SQLERRM, 500) WHERE id = t.id;
      v_failed := v_failed + 1;
    END;
  END LOOP;

  v_final := CASE
    WHEN v_total = 0 THEN 'applied'           -- nothing pending → treat as done (idempotent)
    WHEN v_failed = 0 THEN 'applied'
    WHEN v_applied = 0 THEN 'failed'
    ELSE 'partially_applied'
  END;
  UPDATE erp_change_requests SET status = v_final, applied_at = now() WHERE id = p_request_id;
  RETURN v_final;
END
$$;

-- The due-sweep: apply every request that is ready now. Returns the count applied.
CREATE OR REPLACE FUNCTION erp_change_request_run_due()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  rec record;
  n int := 0;
BEGIN
  FOR rec IN
    SELECT id FROM erp_change_requests
    WHERE status IN ('approved', 'scheduled')
      AND (effective_at IS NULL OR effective_at <= now())
    ORDER BY created_at
  LOOP
    PERFORM erp_change_request_apply(rec.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END
$$;

-- Engine-internal functions: not granted to anon/authenticated. Invoked by the
-- approval flow (definer server action) and the scheduler.
REVOKE ALL ON FUNCTION erp_change_request_apply(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION erp_change_request_run_due() FROM PUBLIC;

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS erp_change_request_run_due();
-- DROP FUNCTION IF EXISTS erp_change_request_apply(uuid);
