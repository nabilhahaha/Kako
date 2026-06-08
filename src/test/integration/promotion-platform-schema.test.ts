import { describe, it, expect } from 'vitest';
import { hasTestDb, connect } from '../db';

/**
 * Enterprise Promotion Platform (Phase 4+) — additive, flag-gated, INERT.
 * Verifies, against the live test DB built from migrations: the augmented
 * promotion master + lifecycle (0217), targeting/funding/budgets (0217), and
 * incentives/commissions/requests (0218). FK-coverage + RLS-wrap enforced
 * globally by schema-health. Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('promotion-platform · schema', () => {
  it('promotion master gains code/description/type/funding + widened status', async () => {
    const c = await connect();
    try {
      const cols = await c.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='erp_trade_promotions'
          AND column_name IN ('code','description','promo_type','funding_model')`);
      expect(cols.rows).toHaveLength(4);
      const chk = await c.query(`
        SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid='erp_trade_promotions'::regclass AND conname='erp_trade_promotions_status_chk'`);
      for (const s of ['pending_approval', 'approved', 'expired'])
        expect(chk.rows[0].def).toContain(`'${s}'`);
    } finally { await c.end().catch(() => {}); }
  });

  it('all six platform tables exist with RLS', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname IN
          ('erp_promotion_targets','erp_promotion_funding','erp_promotion_budgets',
           'erp_incentive_programs','erp_incentive_layers','erp_commission_rules','erp_promotion_requests')
        ORDER BY 1`);
      expect(rows.map((r) => r.relname)).toEqual([
        'erp_commission_rules', 'erp_incentive_layers', 'erp_incentive_programs',
        'erp_promotion_budgets', 'erp_promotion_funding', 'erp_promotion_requests', 'erp_promotion_targets',
      ]);
      expect(rows.every((r) => r.relrowsecurity === true)).toBe(true);
    } finally { await c.end().catch(() => {}); }
  });

  it('commission kind + funding source CHECKs are enforced', async () => {
    const c = await connect();
    try {
      const cr = await c.query(`SELECT string_agg(pg_get_constraintdef(oid),' ') AS d FROM pg_constraint WHERE conrelid='erp_commission_rules'::regclass AND contype='c'`);
      for (const k of ['fixed', 'percentage', 'tiered', 'achievement']) expect(cr.rows[0].d).toContain(`'${k}'`);
      const f = await c.query(`SELECT string_agg(pg_get_constraintdef(oid),' ') AS d FROM pg_constraint WHERE conrelid='erp_promotion_funding'::regclass AND contype='c'`);
      for (const s of ['supplier', 'company', 'distributor']) expect(f.rows[0].d).toContain(`'${s}'`);
    } finally { await c.end().catch(() => {}); }
  });
});
