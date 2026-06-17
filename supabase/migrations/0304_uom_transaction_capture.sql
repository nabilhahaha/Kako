-- ============================================================================
-- 0304: U2 — Transaction-level UoM capture (additive, dormant, reversible)
-- ----------------------------------------------------------------------------
-- Adds three NULLABLE columns to the transaction line tables so a line can
-- record WHICH unit was transacted, without changing the base-unit invariant:
--   • entered_uom  text     — the unit the user entered (e.g. 'carton'); NULL ⇒ base
--   • entered_qty  numeric  — the quantity in that unit (e.g. 2)
--   • uom_factor   numeric  — base units per entered_uom at write time (snapshot)
-- The existing `quantity` / `received_qty` columns REMAIN the BASE quantity, so
-- every current stock/finance/reporting path is unchanged. NULL entered_uom means
-- "base unit" (legacy), so all existing rows and single-UoM tenants are unaffected.
-- These columns are DORMANT until the sell/buy flows are wired (U3/U4) — this
-- migration only prepares the capture surface.
--
-- Rollback: drop the three columns from each table. No data is transformed.
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'erp_invoice_lines', 'erp_purchase_order_lines', 'erp_sales_order_lines',
    'erp_stock_movements', 'erp_van_transfer_lines', 'erp_sales_return_lines',
    'erp_purchase_return_lines'
  ] loop
    execute format('alter table %I add column if not exists entered_uom text', t);
    execute format('alter table %I add column if not exists entered_qty numeric', t);
    execute format('alter table %I add column if not exists uom_factor numeric', t);
    execute format($f$comment on column %I.entered_uom is 'UoM the user entered (NULL = base unit). quantity stays base.'$f$, t);
  end loop;
end $$;
