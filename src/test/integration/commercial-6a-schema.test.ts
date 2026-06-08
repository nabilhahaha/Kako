import { describe, it, expect } from 'vitest';
import { hasTestDb, connect } from '../db';

/**
 * Commercial Excellence 6A — pricing / credit / profitability (Phase 7) —
 * additive, flag-gated, INERT. Verifies the new tables exist with RLS + key
 * CHECKs (0221–0223). FK-coverage + RLS-wrap enforced globally by schema-health.
 * Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('commercial-6a · schema', () => {
  it('all six tables exist with RLS', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname IN
          ('erp_pricing_rules','erp_pricing_priority','erp_price_change_requests',
           'erp_customer_credit_profiles','erp_credit_block_rules','erp_customer_profitability')
        ORDER BY 1`);
      expect(rows.map((r) => r.relname)).toEqual([
        'erp_credit_block_rules', 'erp_customer_credit_profiles', 'erp_customer_profitability',
        'erp_price_change_requests', 'erp_pricing_priority', 'erp_pricing_rules',
      ]);
      expect(rows.every((r) => r.relrowsecurity === true)).toBe(true);
    } finally { await c.end().catch(() => {}); }
  });

  it('pricing rule kind + credit block CHECKs are enforced', async () => {
    const c = await connect();
    try {
      const pr = await c.query(`SELECT string_agg(pg_get_constraintdef(oid),' ') AS d FROM pg_constraint WHERE conrelid='erp_pricing_rules'::regclass AND contype='c'`);
      for (const k of ['quantity_break', 'value_break', 'tiered', 'seasonal']) expect(pr.rows[0].d).toContain(`'${k}'`);
      const cb = await c.query(`SELECT string_agg(pg_get_constraintdef(oid),' ') AS d FROM pg_constraint WHERE conrelid='erp_credit_block_rules'::regclass AND contype='c'`);
      for (const m of ['hard_block', 'soft_block', 'approval_required']) expect(cb.rows[0].d).toContain(`'${m}'`);
    } finally { await c.end().catch(() => {}); }
  });
});
