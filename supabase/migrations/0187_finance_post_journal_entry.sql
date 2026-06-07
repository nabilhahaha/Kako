-- ============================================================================
-- 0187: Finance Foundation — atomic posting RPC for the posting-rule engine
-- ----------------------------------------------------------------------------
-- erp_post_journal_entry(...) writes ONE balanced, posted journal entry + its
-- lines in a single transaction, given lines already resolved to account_ids by
-- the TS poster (which selected the rule + resolved account_key→account_id under
-- the caller's RLS). Defense-in-depth for data integrity:
--   * server-side balance re-check (Σdebit = Σcredit) — never store an unbalanced
--     entry even if a caller is buggy;
--   * non-empty guard;
--   * tenant guard — the target branch must belong to the caller's company
--     (platform owner exempt) — no cross-tenant posting.
-- Mirrors the existing erp_post_revenue helper (entry_number via erp_next_number,
-- status='posted'). SECURITY DEFINER + REVOKE/GRANT like the other posting fns.
-- Idempotency (one entry per source document) is enforced by the TS poster before
-- calling this; flag-gated in the app (KAKO_FINANCE, default OFF) — inert until on.
-- Additive; depends on 0067 (erp_journal_*, erp_next_number), 0018 (tenant helpers).
-- ============================================================================

CREATE OR REPLACE FUNCTION erp_post_journal_entry(
  p_branch         uuid,
  p_entry_date     date,
  p_description    text,
  p_reference_type text,
  p_reference_id   uuid,       -- erp_journal_entries.reference_id is uuid (source-doc PK)
  p_lines          jsonb       -- [{account_id, debit, credit, cost_center_id?, description?}]
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_entry  uuid;
  v_debit  numeric;
  v_credit numeric;
  v_count  integer;
  v_company uuid;
BEGIN
  IF p_branch IS NULL THEN RAISE EXCEPTION 'posting requires a branch'; END IF;

  -- Tenant guard: the branch must belong to the caller's company.
  SELECT company_id INTO v_company FROM erp_branches WHERE id = p_branch;
  IF v_company IS NULL THEN RAISE EXCEPTION 'branch not found'; END IF;
  IF NOT erp_is_platform_owner() AND v_company <> erp_user_company_id() THEN
    RAISE EXCEPTION 'cross-tenant posting denied';
  END IF;

  -- Balance + non-empty guard (defense in depth; the TS resolver also enforces).
  SELECT COALESCE(sum((l->>'debit')::numeric), 0),
         COALESCE(sum((l->>'credit')::numeric), 0),
         count(*)
    INTO v_debit, v_credit, v_count
    FROM jsonb_array_elements(p_lines) AS l;
  IF v_count = 0 THEN RAISE EXCEPTION 'posting has no lines'; END IF;
  IF round(v_debit, 2) <> round(v_credit, 2) THEN
    RAISE EXCEPTION 'unbalanced posting: debit % <> credit %', v_debit, v_credit;
  END IF;

  INSERT INTO erp_journal_entries
    (entry_number, entry_date, description, reference_type, reference_id, branch_id, status, created_by, posted_by, posted_at)
  VALUES
    (erp_next_number(p_branch, 'journal'), p_entry_date, p_description, p_reference_type, p_reference_id, p_branch, 'posted', v_uid, v_uid, now())
  RETURNING id INTO v_entry;

  INSERT INTO erp_journal_lines (journal_entry_id, account_id, debit, credit, cost_center_id, description)
  SELECT v_entry,
         (l->>'account_id')::uuid,
         COALESCE((l->>'debit')::numeric, 0),
         COALESCE((l->>'credit')::numeric, 0),
         NULLIF(l->>'cost_center_id', '')::uuid,
         l->>'description'
    FROM jsonb_array_elements(p_lines) AS l;

  RETURN v_entry;
END $$;

REVOKE ALL ON FUNCTION erp_post_journal_entry(uuid, date, text, text, uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION erp_post_journal_entry(uuid, date, text, text, uuid, jsonb) TO authenticated;
