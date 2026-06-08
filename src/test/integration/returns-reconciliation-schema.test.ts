import { describe, it, expect } from 'vitest';
import { hasTestDb, connect } from '../db';

/**
 * Enterprise Returns / Credit Notes / Reconciliation (Phase 4+) — additive,
 * flag-gated, INERT. Verifies, against the live test DB: augmented returns tables
 * + the policy + credit-note tables (0219). FK-coverage + RLS-wrap enforced
 * globally by schema-health. Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('returns-reconciliation · schema', () => {
  it('erp_sales_returns gains reversal/traceability columns', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='erp_sales_returns'
          AND column_name IN ('return_type','creation_mode','reason_id','promotion_id','free_qty_returned',
            'discount_reversed','funding_reversed','incentive_adjustment','commission_adjustment',
            'credit_note_number','net_return_value','approval_stage')`);
      expect(rows).toHaveLength(12);
    } finally { await c.end().catch(() => {}); }
  });

  it('erp_sales_return_lines gains original-line + reversal columns', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='erp_sales_return_lines'
          AND column_name IN ('original_invoice_line_id','sold_qty','free_qty_sold','free_qty_returned',
            'discount_amount','promotion_id','reversal_value','net_value')`);
      expect(rows).toHaveLength(8);
    } finally { await c.end().catch(() => {}); }
  });

  it('return policy + credit note tables exist with RLS', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname IN ('erp_return_policies','erp_credit_notes') ORDER BY 1`);
      expect(rows.map((r) => r.relname)).toEqual(['erp_credit_notes', 'erp_return_policies']);
      expect(rows.every((r) => r.relrowsecurity === true)).toBe(true);
    } finally { await c.end().catch(() => {}); }
  });
});
