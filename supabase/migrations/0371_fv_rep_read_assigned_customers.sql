-- ============================================================================
-- 0371 — FV: let a field rep READ the dataset customers ASSIGNED to them
-- (ADDITIVE, idempotent, read-only). Fixes "My Nearby Customers / Assigned list
-- shows 0" for a salesman rep.
--
-- Root cause: the SELECT policy on erp_rp_dataset_customers (rp_dsc_sel) grants read
-- only to platform owner / super admin / company admin / dataset owner / route-planner-
-- visible users. A plain rep (role 'salesman') is none of these, so RLS filtered out
-- ALL of their assigned customers — even though dataset_customers.salesman = the rep's
-- email. The FV rep flow (getMyNearbyCustomers / submitVerification) reads by
-- salesman = the rep's profile email, so the rep MUST be able to read the rows
-- assigned to them.
--
-- Fix: an additive, read-only, tightly-scoped SELECT policy — a rep may read a row only
-- when it is in their company AND assigned to them (salesman = their own profile email).
-- No write/insert/update/delete access is granted. The verifications table already lets
-- a rep read/insert their own rows (rep_id = auth.uid()), so no change is needed there.
--
-- Reverse:
--   DROP POLICY IF EXISTS rp_dsc_sel_assignee ON erp_rp_dataset_customers;
--   DROP FUNCTION IF EXISTS erp_user_email();
-- ============================================================================

-- Current user's profile email. SECURITY DEFINER so the policy can resolve the email
-- without recursing through erp_profiles' own RLS. Matches the key the app filters by
-- (ctx.profile.email) and the key the admin assign writes (erp_profiles.email).
CREATE OR REPLACE FUNCTION erp_user_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM erp_profiles WHERE id = auth.uid()
$$;

REVOKE ALL ON FUNCTION erp_user_email() FROM public;
GRANT EXECUTE ON FUNCTION erp_user_email() TO authenticated;

DROP POLICY IF EXISTS rp_dsc_sel_assignee ON erp_rp_dataset_customers;
CREATE POLICY rp_dsc_sel_assignee ON erp_rp_dataset_customers
FOR SELECT
USING (
  company_id = erp_user_company_id()
  AND salesman IS NOT NULL
  AND salesman = erp_user_email()
);
