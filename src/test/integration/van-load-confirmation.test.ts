import { describe, it, expect } from 'vitest';
import { hasTestDb, connect } from '../db';

/**
 * Van Sales (0246) — load confirmation tables exist with company-scoped RLS, and
 * the additive stock-request fields (origin, approved_qty) are present. Confirms
 * the migration applies clean from scratch. Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('van-sales · load confirmation schema', () => {
  it('confirmation tables exist with RLS enabled', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT cl.relname, cl.relrowsecurity FROM pg_class cl JOIN pg_namespace n ON n.oid=cl.relnamespace
        WHERE n.nspname='public' AND cl.relname IN ('erp_van_load_confirmations','erp_van_load_confirmation_lines') ORDER BY 1`);
      expect(rows.map((r) => r.relname)).toEqual(['erp_van_load_confirmation_lines', 'erp_van_load_confirmations']);
      expect(rows.every((r) => r.relrowsecurity === true)).toBe(true);
    } finally { await c.end().catch(() => {}); }
  });

  it('status CHECK + one-confirmation-per-manifest', async () => {
    const c = await connect();
    try {
      const chk = await c.query(`
        SELECT pg_get_constraintdef(oid) def FROM pg_constraint
        WHERE conrelid='erp_van_load_confirmations'::regclass AND contype='c'`);
      expect(chk.rows.some((r) => r.def.includes('accept_with_variance') && r.def.includes('accept_partial'))).toBe(true);
      const uq = await c.query(`
        SELECT pg_get_constraintdef(oid) def FROM pg_constraint
        WHERE conrelid='erp_van_load_confirmations'::regclass AND contype='u'`);
      expect(uq.rows.some((r) => r.def.toLowerCase().includes('manifest_id'))).toBe(true);
    } finally { await c.end().catch(() => {}); }
  });

  it('additive stock-request fields exist (origin, approved_qty)', async () => {
    const c = await connect();
    try {
      const cols = await c.query(`
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_name IN ('erp_stock_requests','erp_stock_request_lines')
          AND column_name IN ('origin','approved_qty')`);
      const set = new Set(cols.rows.map((r) => `${r.table_name}.${r.column_name}`));
      expect(set.has('erp_stock_requests.origin')).toBe(true);
      expect(set.has('erp_stock_request_lines.approved_qty')).toBe(true);
    } finally { await c.end().catch(() => {}); }
  });
});
