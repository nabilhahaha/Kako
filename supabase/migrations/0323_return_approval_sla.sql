-- 0323 — Return Approval Workflow, SLA tracking.
--
-- Adds first_viewed_at / first_viewed_by on the return header so reports can
-- measure approval responsiveness:
--   • Time To Review  = first_viewed_at − requested_at
--   • Time To Approve = (approved_at | rejected_at) − requested_at
-- and surface bottlenecks (pending > 24h / > 48h, average approval time).
-- requested_at / approved_at / rejected_at already exist (migration 0320).
-- ADDITIVE, flag-gated (platform.return_approval).

ALTER TABLE erp_sales_returns
  ADD COLUMN IF NOT EXISTS first_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_viewed_by uuid;

-- Stamp the first time an approver opens a held return (idempotent: set once).
-- SECURITY DEFINER so the approver can record the view under branch access even
-- though the header is otherwise written only by the posting RPCs.
CREATE OR REPLACE FUNCTION erp_mark_return_viewed(p_return_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_branch uuid; v_status erp_return_status; v_first timestamptz; v_requester uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT branch_id, status, first_viewed_at, COALESCE(requested_by, created_by)
    INTO v_branch, v_status, v_first, v_requester
    FROM erp_sales_returns WHERE id = p_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'return_not_found'; END IF;
  IF NOT erp_has_branch_access(v_branch) THEN RAISE EXCEPTION 'branch_access_denied'; END IF;
  -- Only stamp a held return, only once, and never by the requester themselves.
  IF v_status = 'pending_approval' AND v_first IS NULL AND v_requester IS DISTINCT FROM v_uid THEN
    UPDATE erp_sales_returns SET first_viewed_at = now(), first_viewed_by = v_uid WHERE id = p_return_id;
    RETURN now();
  END IF;
  RETURN v_first;
END $$;

REVOKE EXECUTE ON FUNCTION public.erp_mark_return_viewed(uuid) FROM anon;
