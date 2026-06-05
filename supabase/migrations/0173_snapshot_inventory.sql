-- ============================================================================
-- 0173: include inventory in the company snapshot (for backup/restore preview)
-- ----------------------------------------------------------------------------
-- Adds the company's stock levels (erp_inventory_stock for its warehouses) to
-- the backup snapshot so restore can preview/restore inventory records too.
-- Additive: CREATE OR REPLACE only.
-- ============================================================================

CREATE OR REPLACE FUNCTION erp_snapshot_company(p_co UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'meta', jsonb_build_object('exported_at', now(), 'company_id', p_co, 'version', 2),
    'company',  (SELECT to_jsonb(c) FROM erp_companies c WHERE c.id = p_co),
    'products', (SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb) FROM erp_products_catalog p WHERE p.company_id = p_co),
    'customers',(SELECT COALESCE(jsonb_agg(to_jsonb(c)), '[]'::jsonb) FROM erp_customers c WHERE c.company_id = p_co),
    'suppliers',(SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::jsonb) FROM erp_suppliers s WHERE s.company_id = p_co),
    'invoices', (SELECT COALESCE(jsonb_agg(to_jsonb(i)), '[]'::jsonb) FROM erp_invoices i WHERE i.branch_id IN (SELECT id FROM erp_branches WHERE company_id = p_co)),
    'invoice_lines', (SELECT COALESCE(jsonb_agg(to_jsonb(l)), '[]'::jsonb) FROM erp_invoice_lines l WHERE l.invoice_id IN (SELECT id FROM erp_invoices WHERE branch_id IN (SELECT id FROM erp_branches WHERE company_id = p_co))),
    'installment_plans', (SELECT COALESCE(jsonb_agg(to_jsonb(ip)), '[]'::jsonb) FROM erp_installment_plans ip WHERE ip.company_id = p_co),
    'installment_schedule', (SELECT COALESCE(jsonb_agg(to_jsonb(sc)), '[]'::jsonb) FROM erp_installment_schedule sc WHERE sc.company_id = p_co),
    'sales_returns', (SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM erp_sales_returns r WHERE r.branch_id IN (SELECT id FROM erp_branches WHERE company_id = p_co)),
    'expenses', (SELECT COALESCE(jsonb_agg(to_jsonb(e)), '[]'::jsonb) FROM erp_expenses e WHERE e.company_id = p_co),
    'inventory', (SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::jsonb) FROM erp_inventory_stock s WHERE s.warehouse_id IN (SELECT w.id FROM erp_warehouses w JOIN erp_branches b ON b.id = w.branch_id WHERE b.company_id = p_co))
  );
$$;
