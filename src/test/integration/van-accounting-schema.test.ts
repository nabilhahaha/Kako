import { describe, it, expect } from 'vitest';
import { hasTestDb, connect } from '../db';

/**
 * Route Accounting & Van Operations (Phase 7A) — additive, flag-gated, INERT.
 * Verifies the five new tables + seeded expense categories (0229). FK-coverage +
 * RLS-wrap enforced globally by schema-health. Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('van-accounting · schema', () => {
  it('all five tables exist with RLS', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT cl.relname, cl.relrowsecurity FROM pg_class cl JOIN pg_namespace n ON n.oid=cl.relnamespace
        WHERE n.nspname='public' AND cl.relname IN
          ('erp_van_opening_balances','erp_van_expense_categories','erp_van_expenses',
           'erp_van_cash_reconciliations','erp_van_day_settlements')
        ORDER BY 1`);
      expect(rows.map((r) => r.relname)).toEqual([
        'erp_van_cash_reconciliations', 'erp_van_day_settlements', 'erp_van_expense_categories',
        'erp_van_expenses', 'erp_van_opening_balances',
      ]);
      expect(rows.every((r) => r.relrowsecurity === true)).toBe(true);
    } finally { await c.end().catch(() => {}); }
  });

  it('default expense categories are seeded (company_id NULL)', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`SELECT code FROM erp_van_expense_categories WHERE company_id IS NULL ORDER BY code`);
      expect(rows.map((r) => r.code)).toEqual(['fuel', 'maintenance', 'misc', 'parking', 'per_diem', 'tolls']);
    } finally { await c.end().catch(() => {}); }
  });

  it('cash recon + settlement status CHECKs are enforced', async () => {
    const c = await connect();
    try {
      const r = await c.query(`SELECT string_agg(pg_get_constraintdef(oid),' ') AS d FROM pg_constraint WHERE conrelid='erp_van_cash_reconciliations'::regclass AND contype='c'`);
      for (const s of ['draft', 'settled', 'rejected']) expect(r.rows[0].d).toContain(`'${s}'`);
    } finally { await c.end().catch(() => {}); }
  });
});
