-- ============================================================================
-- 0294 — DATA REPAIR: advance erp_sequences counters to match existing documents
-- ----------------------------------------------------------------------------
-- ROOT CAUSE (audit BL-2)
--   erp_next_number(branch_id, seq_type) is an atomic counter in erp_sequences
--   (ON CONFLICT DO UPDATE current_val+1). When document rows were imported/seeded
--   directly (without calling erp_next_number), the counter LAGS the highest
--   existing number for that (branch, type). The next generated number then
--   re-issues an already-used value and violates the (branch_id, number) unique
--   index → "duplicate code" on invoice/order/etc. creation.
--
-- FIX
--   For every branch-scoped document table, advance the matching erp_sequences
--   counter to GREATEST(current_val, max trailing-integer of existing numbers).
--   Over-advancing is SAFE (skips a few numbers, never collides); under-advancing
--   is what caused the bug. Creates the counter row (with the canonical prefix)
--   when documents exist but no counter row does yet.
--
-- SAFETY
--   • Non-destructive: touches ONLY the erp_sequences counter rows. No business
--     row is read-for-write, altered, or deleted.
--   • Idempotent: GREATEST() means re-running is a no-op.
--   • Forward-only by nature (you cannot un-issue a number); reversal would mean
--     manually lowering a counter, which is never desirable.
-- ============================================================================

DO $$
DECLARE
  m record;
BEGIN
  FOR m IN
    SELECT * FROM (VALUES
      ('erp_invoices',         'invoice_number',    'invoice',         'INV'),
      ('erp_sales_orders',     'order_number',      'sales_order',     'SO'),
      ('erp_purchase_orders',  'po_number',         'purchase_order',  'PO'),
      ('erp_sales_returns',    'return_number',     'return',          'RET'),
      ('erp_journal_entries',  'entry_number',      'journal',         'JV'),
      ('erp_payment_vouchers', 'voucher_number',    'payment_voucher', 'PV'),
      ('erp_receipt_vouchers', 'voucher_number',    'receipt_voucher', 'RV'),
      ('erp_collections',      'collection_number', 'collection',      'COL')
    ) AS t(tbl, col, seq_type, prefix)
  LOOP
    IF to_regclass('public.' || m.tbl) IS NULL THEN CONTINUE; END IF;
    EXECUTE format(
      'INSERT INTO erp_sequences (branch_id, seq_type, prefix, current_val)
         SELECT d.branch_id, %L, %L, max((substring(d.%I from ''(\d+)$''))::bigint)
         FROM %I d
         WHERE d.branch_id IS NOT NULL AND d.%I ~ ''\d+$''
         GROUP BY d.branch_id
       ON CONFLICT (branch_id, seq_type) DO UPDATE
         SET current_val = GREATEST(erp_sequences.current_val, EXCLUDED.current_val)',
      m.seq_type, m.prefix, m.col, m.tbl, m.col
    );
  END LOOP;
END $$;
