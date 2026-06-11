-- ============================================================================
-- 0281 — Performance indexes for pharmacy dashboard / reports at scale
-- ----------------------------------------------------------------------------
-- Assumes tens of thousands of products + hundreds of thousands of movements.
-- Targets the dashboard/report aggregations (today/period filters, dead-stock
-- NOT EXISTS, cash). Additive; concurrent not used (small maintenance window).
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON erp_invoices (created_at);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_product ON erp_invoice_lines (product_id);
CREATE INDEX IF NOT EXISTS idx_stock_mov_prod_type_date
  ON erp_stock_movements (product_id, movement_type, created_at);
CREATE INDEX IF NOT EXISTS idx_payments_method_date ON erp_payments (payment_method, payment_date);
CREATE INDEX IF NOT EXISTS idx_inventory_stock_product ON erp_inventory_stock (product_id);
CREATE INDEX IF NOT EXISTS idx_products_company_medicine
  ON erp_products_catalog (company_id) WHERE is_medicine;
