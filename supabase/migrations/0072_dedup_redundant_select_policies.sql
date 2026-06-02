-- 0072_dedup_redundant_select_policies.sql
-- Performance: `multiple_permissive_policies` advisor.
--
-- 29 tables carry a `_select` (FOR SELECT) policy whose USING expression is
-- byte-identical to their `_manage` (FOR ALL) policy. Since FOR ALL already
-- grants SELECT with the same condition, the `_select` policy is fully
-- redundant and only forces Postgres to OR-evaluate two identical policies on
-- every row read. Dropping it is a no-op for access control.

drop policy if exists erp_bank_accounts_select on erp_bank_accounts;
drop policy if exists erp_branches_select on erp_branches;
drop policy if exists erp_coa_select on erp_chart_of_accounts;
drop policy if exists erp_companies_select on erp_companies;
drop policy if exists erp_cost_centers_select on erp_cost_centers;
drop policy if exists erp_fiscal_periods_select on erp_fiscal_periods;
drop policy if exists erp_goods_receipt_lines_select on erp_goods_receipt_lines;
drop policy if exists erp_goods_receipts_select on erp_goods_receipts;
drop policy if exists erp_inventory_stock_select on erp_inventory_stock;
drop policy if exists erp_invoice_lines_select on erp_invoice_lines;
drop policy if exists erp_invoices_select on erp_invoices;
drop policy if exists erp_journal_entries_select on erp_journal_entries;
drop policy if exists erp_journal_lines_select on erp_journal_lines;
drop policy if exists erp_payment_vouchers_select on erp_payment_vouchers;
drop policy if exists erp_payments_select on erp_payments;
drop policy if exists erp_price_list_items_select on erp_price_list_items;
drop policy if exists erp_purchase_order_lines_select on erp_purchase_order_lines;
drop policy if exists erp_purchase_orders_select on erp_purchase_orders;
drop policy if exists erp_receipt_vouchers_select on erp_receipt_vouchers;
drop policy if exists erp_sales_order_lines_select on erp_sales_order_lines;
drop policy if exists erp_sales_orders_select on erp_sales_orders;
drop policy if exists erp_sales_return_lines_select on erp_sales_return_lines;
drop policy if exists erp_sales_returns_select on erp_sales_returns;
drop policy if exists erp_sequences_select on erp_sequences;
drop policy if exists erp_stock_movements_select on erp_stock_movements;
drop policy if exists erp_supplier_payments_select on erp_supplier_payments;
drop policy if exists erp_transfer_order_lines_select on erp_transfer_order_lines;
drop policy if exists erp_transfer_orders_select on erp_transfer_orders;
drop policy if exists erp_warehouses_select on erp_warehouses;
