-- ============================================================================
-- 0268 — TENANT-SCOPE BUSINESS-DOCUMENT NUMBERING (multi-tenant correctness)
-- ----------------------------------------------------------------------------
-- ROOT CAUSE
--   Document numbers are generated as  PREFIX-<BRANCH_CODE>-NNNNNN  with the
--   counter in erp_sequences keyed by (branch_id, seq_type). Branch codes are
--   unique only WITHIN a company (erp_branches UNIQUE(company_id, code)), so two
--   different tenants may each own a branch coded e.g. 'CAI'. Each branch counter
--   independently starts at 1 and emits identical strings (INV-CAI-000001, …).
--   Several document tables carried a GLOBAL unique index on the number column,
--   so the SECOND tenant to emit a given string failed with a duplicate-key
--   error — a functional outage on a shared multi-tenant database.
--
-- FIX
--   Re-scope each unique index from global → the document's natural owning scope,
--   matching how the counter is keyed and how erp_credit_notes already scopes
--   (company_id, credit_note_number). The number string is unchanged; only the
--   uniqueness scope changes. Also adds the MISSING uniqueness guarantee on
--   erp_collections.collection_number.
--
--   Scope columns (all globally-unique UUIDs, so cross-tenant collisions vanish):
--     branch_id          → invoices, sales_returns, purchase_orders,
--                          purchase_returns, sales_orders, journal_entries,
--                          payment_vouchers, receipt_vouchers, rma, collections(NEW)
--     warehouse_id       → goods_receipts
--     from_warehouse_id  → transfer_orders
--
-- SAFETY / BACKWARD COMPATIBILITY
--   • Non-destructive: no rows are altered or deleted; only index definitions change.
--   • Cannot fail on existing data: a GLOBAL-unique column is, by definition,
--     also unique within any sub-scope, so every existing row already satisfies
--     the narrower (scope, number) index.
--   • No RLS change. No function/signature change. No ON CONFLICT clause anywhere
--     references these number columns/constraints (verified), so RPC inserts are
--     unaffected — the number still comes from erp_next_number and the index is a
--     backstop.
--   • Idempotent (IF EXISTS / IF NOT EXISTS), so the migration chain re-applies cleanly.
--
-- REVERSIBILITY (manual rollback — restores the previous global-unique indexes)
--   DROP INDEX IF EXISTS erp_invoices_invoice_number_scope_key;        CREATE UNIQUE INDEX erp_invoices_invoice_number_key        ON erp_invoices(invoice_number);
--   DROP INDEX IF EXISTS erp_sales_returns_return_number_scope_key;    CREATE UNIQUE INDEX erp_sales_returns_return_number_key    ON erp_sales_returns(return_number);
--   DROP INDEX IF EXISTS erp_purchase_orders_po_number_scope_key;      CREATE UNIQUE INDEX erp_purchase_orders_po_number_key      ON erp_purchase_orders(po_number);
--   DROP INDEX IF EXISTS erp_purchase_returns_return_number_scope_key; CREATE UNIQUE INDEX erp_purchase_returns_return_number_key ON erp_purchase_returns(return_number);
--   DROP INDEX IF EXISTS erp_sales_orders_order_number_scope_key;      CREATE UNIQUE INDEX erp_sales_orders_order_number_key      ON erp_sales_orders(order_number);
--   DROP INDEX IF EXISTS erp_journal_entries_entry_number_scope_key;   CREATE UNIQUE INDEX erp_journal_entries_entry_number_key   ON erp_journal_entries(entry_number);
--   DROP INDEX IF EXISTS erp_payment_vouchers_voucher_number_scope_key;CREATE UNIQUE INDEX erp_payment_vouchers_voucher_number_key ON erp_payment_vouchers(voucher_number);
--   DROP INDEX IF EXISTS erp_receipt_vouchers_voucher_number_scope_key;CREATE UNIQUE INDEX erp_receipt_vouchers_voucher_number_key ON erp_receipt_vouchers(voucher_number);
--   DROP INDEX IF EXISTS erp_rma_rma_number_scope_key;                 CREATE UNIQUE INDEX erp_rma_rma_number_key                 ON erp_rma(rma_number);
--   DROP INDEX IF EXISTS erp_goods_receipts_receipt_number_scope_key;  CREATE UNIQUE INDEX erp_goods_receipts_receipt_number_key  ON erp_goods_receipts(receipt_number);
--   DROP INDEX IF EXISTS erp_transfer_orders_transfer_number_scope_key;CREATE UNIQUE INDEX erp_transfer_orders_transfer_number_key ON erp_transfer_orders(transfer_number);
--   DROP INDEX IF EXISTS erp_collections_collection_number_scope_key;  -- (collections had no prior unique to restore)
-- ============================================================================

-- The old global-unique names are backed by UNIQUE CONSTRAINTS on most tables
-- (and bare indexes on a few). Drop either form idempotently: DROP CONSTRAINT
-- removes a constraint + its index; the following DROP INDEX clears a bare index
-- if that's what existed. Neither errors when the object is absent.

-- ── branch-scoped documents ────────────────────────────────────────────────
ALTER TABLE erp_invoices       DROP CONSTRAINT IF EXISTS erp_invoices_invoice_number_key;
DROP INDEX IF EXISTS erp_invoices_invoice_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS erp_invoices_invoice_number_scope_key
  ON erp_invoices(branch_id, invoice_number);

ALTER TABLE erp_sales_returns  DROP CONSTRAINT IF EXISTS erp_sales_returns_return_number_key;
DROP INDEX IF EXISTS erp_sales_returns_return_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS erp_sales_returns_return_number_scope_key
  ON erp_sales_returns(branch_id, return_number);

ALTER TABLE erp_purchase_orders DROP CONSTRAINT IF EXISTS erp_purchase_orders_po_number_key;
DROP INDEX IF EXISTS erp_purchase_orders_po_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS erp_purchase_orders_po_number_scope_key
  ON erp_purchase_orders(branch_id, po_number);

ALTER TABLE erp_purchase_returns DROP CONSTRAINT IF EXISTS erp_purchase_returns_return_number_key;
DROP INDEX IF EXISTS erp_purchase_returns_return_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS erp_purchase_returns_return_number_scope_key
  ON erp_purchase_returns(branch_id, return_number);

ALTER TABLE erp_sales_orders   DROP CONSTRAINT IF EXISTS erp_sales_orders_order_number_key;
DROP INDEX IF EXISTS erp_sales_orders_order_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS erp_sales_orders_order_number_scope_key
  ON erp_sales_orders(branch_id, order_number);

ALTER TABLE erp_journal_entries DROP CONSTRAINT IF EXISTS erp_journal_entries_entry_number_key;
DROP INDEX IF EXISTS erp_journal_entries_entry_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS erp_journal_entries_entry_number_scope_key
  ON erp_journal_entries(branch_id, entry_number);

ALTER TABLE erp_payment_vouchers DROP CONSTRAINT IF EXISTS erp_payment_vouchers_voucher_number_key;
DROP INDEX IF EXISTS erp_payment_vouchers_voucher_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS erp_payment_vouchers_voucher_number_scope_key
  ON erp_payment_vouchers(branch_id, voucher_number);

ALTER TABLE erp_receipt_vouchers DROP CONSTRAINT IF EXISTS erp_receipt_vouchers_voucher_number_key;
DROP INDEX IF EXISTS erp_receipt_vouchers_voucher_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS erp_receipt_vouchers_voucher_number_scope_key
  ON erp_receipt_vouchers(branch_id, voucher_number);

ALTER TABLE erp_rma            DROP CONSTRAINT IF EXISTS erp_rma_rma_number_key;
DROP INDEX IF EXISTS erp_rma_rma_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS erp_rma_rma_number_scope_key
  ON erp_rma(branch_id, rma_number);

-- ── warehouse-scoped documents (no branch_id column; warehouse is the owner) ──
ALTER TABLE erp_goods_receipts DROP CONSTRAINT IF EXISTS erp_goods_receipts_receipt_number_key;
DROP INDEX IF EXISTS erp_goods_receipts_receipt_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS erp_goods_receipts_receipt_number_scope_key
  ON erp_goods_receipts(warehouse_id, receipt_number);

ALTER TABLE erp_transfer_orders DROP CONSTRAINT IF EXISTS erp_transfer_orders_transfer_number_key;
DROP INDEX IF EXISTS erp_transfer_orders_transfer_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS erp_transfer_orders_transfer_number_scope_key
  ON erp_transfer_orders(from_warehouse_id, transfer_number);

-- ── collections: ADD the previously-missing uniqueness guarantee ─────────────
-- (Partial index: only enforce when a number is present; legacy NULL numbers
--  from the pre-numbering era remain unaffected.)
CREATE UNIQUE INDEX IF NOT EXISTS erp_collections_collection_number_scope_key
  ON erp_collections(branch_id, collection_number)
  WHERE collection_number IS NOT NULL;
