-- ============================================================================
-- 0105: FMCG hierarchy Slice S4b — Transactional Scope + Write-Scope
-- ----------------------------------------------------------------------------
-- Completes S4. Narrows the SCOPED FMCG roles' visibility of commercial rows
-- (invoices / sales orders / sales returns / payments / visits) to their own
-- customers, reusing the S4a resolver. Company-wide roles keep TODAY's behavior
-- exactly (decision B1: these tables are already branch-scoped via
-- erp_user_branch_ids() — unchanged for company-wide roles → zero regression).
-- Also tightens write-scope (WITH CHECK) on erp_customers / erp_routes so scoped
-- roles create/edit only in-scope rows (a rep self-assigns on create).
--
-- Owner decisions (locked): B1 keep branch-scope for company-wide; narrow
-- reps/supervisors to their customers; write-scope on customers/routes; table set
-- = invoices/orders/returns/payments/visits (line tables inherit via parent;
-- inventory/accounting excluded); branch managers stay branch-level on txns.
--
-- Read scope only on transactional tables (USING); their writes keep the current
-- branch gate (WITH CHECK). RLS-enforced; SECURITY DEFINER STABLE resolvers; held
-- from production; rolled-back-live verified per role (incl. "company-wide loses
-- nothing").
-- ============================================================================

-- ── Resolver: is a transactional row's customer in the current user's scope? ──
CREATE OR REPLACE FUNCTION erp_customer_id_in_scope(p_customer_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE c RECORD;
BEGIN
  SELECT branch_id, region_id, area_id, salesman_id, route_id, company_id
    INTO c FROM erp_customers WHERE id = p_customer_id;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Defense in depth: never cross tenants (the company-wide path already gates on
  -- branch; scoped clauses are self/own-region but guard the customer's company).
  IF NOT erp_is_platform_owner() AND c.company_id IS DISTINCT FROM erp_user_company_id() THEN
    RETURN false;
  END IF;
  RETURN erp_customer_in_scope(c.branch_id, c.region_id, c.area_id, c.salesman_id, c.route_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_customer_id_in_scope(uuid) FROM anon;

-- Payments have no customer_id/branch_id — they scope through their invoice.
CREATE OR REPLACE FUNCTION erp_invoice_id_in_scope(p_invoice_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE inv RECORD;
BEGIN
  SELECT branch_id, customer_id INTO inv FROM erp_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF erp_user_is_company_wide() THEN RETURN inv.branch_id = ANY(erp_user_branch_ids()); END IF;
  RETURN erp_customer_id_in_scope(inv.customer_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_invoice_id_in_scope(uuid) FROM anon;

-- Write gate for payments (keeps current branch behavior on writes).
CREATE OR REPLACE FUNCTION erp_invoice_branch_visible(p_invoice_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_branch uuid;
BEGIN
  SELECT branch_id INTO v_branch FROM erp_invoices WHERE id = p_invoice_id;
  RETURN FOUND AND v_branch = ANY(erp_user_branch_ids());
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_invoice_branch_visible(uuid) FROM anon;

-- ── Transactional tables with branch_id + customer_id ────────────────────────
-- Read: company-wide → branch gate (unchanged); scoped → their customers.
-- Write: branch gate (unchanged).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['erp_invoices','erp_sales_orders','erp_sales_returns','erp_visits'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_manage" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_all" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_scope" ON %I', t, t);
    EXECUTE format($f$
      CREATE POLICY "%1$s_scope" ON %1$I FOR ALL
        USING ( CASE WHEN erp_user_is_company_wide()
                     THEN branch_id = ANY(erp_user_branch_ids())
                     ELSE erp_customer_id_in_scope(customer_id) END )
        WITH CHECK ( branch_id = ANY(erp_user_branch_ids()) )
    $f$, t);
  END LOOP;
END $$;

-- ── Payments (scope via invoice) ─────────────────────────────────────────────
DROP POLICY IF EXISTS "erp_payments_select" ON erp_payments;
DROP POLICY IF EXISTS "erp_payments_manage" ON erp_payments;
DROP POLICY IF EXISTS "erp_payments_scope" ON erp_payments;
CREATE POLICY "erp_payments_scope" ON erp_payments FOR ALL
  USING ( erp_invoice_id_in_scope(invoice_id) )
  WITH CHECK ( erp_invoice_branch_visible(invoice_id) );

-- ── Write-scope on customers / routes (decision C; tighten S4a's WITH CHECK) ──
-- A scoped role may create/edit only in-scope rows (a rep self-assigns on create:
-- erp_customer_in_scope matches when salesman_id = auth.uid()). Reads unchanged.
DROP POLICY IF EXISTS "erp_customers_scope" ON erp_customers;
CREATE POLICY "erp_customers_scope" ON erp_customers FOR ALL
  USING (
    erp_is_platform_owner()
    OR (company_id = erp_user_company_id()
        AND erp_customer_in_scope(branch_id, region_id, area_id, salesman_id, route_id))
  )
  WITH CHECK (
    erp_is_platform_owner()
    OR (company_id = erp_user_company_id()
        AND (erp_user_is_company_wide()
             OR erp_customer_in_scope(branch_id, region_id, area_id, salesman_id, route_id)))
  );

DROP POLICY IF EXISTS "erp_routes_scope" ON erp_routes;
CREATE POLICY "erp_routes_scope" ON erp_routes FOR ALL
  USING (
    erp_is_platform_owner()
    OR (company_id = erp_user_company_id() AND erp_route_in_scope(rep_id))
  )
  WITH CHECK (
    erp_is_platform_owner()
    OR (company_id = erp_user_company_id()
        AND (erp_user_is_company_wide() OR erp_route_in_scope(rep_id)))
  );

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- Restore the pre-S4b transactional policies (branch gate) and S4a's permissive
-- (company-only) WITH CHECK on customers/routes:
--   erp_invoices/sales_orders/sales_returns/visits → FOR ALL USING/CHECK
--     (branch_id = ANY(erp_user_branch_ids())); payments → invoice-branch subquery.
--   erp_customers_scope / erp_routes_scope → WITH CHECK (company_id = erp_user_company_id()).
--   DROP the three erp_*_in_scope / erp_invoice_branch_visible helpers.
