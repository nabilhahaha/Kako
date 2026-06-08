import { describe, it, expect } from 'vitest';
import { hasTestDb, connect } from '../db';

/**
 * Mobile Field App — offline sync (Phase 7B) — additive, flag-gated, INERT.
 * Verifies the offline-mutation queue (exactly-once unique key + status CHECK) +
 * device-session audit (0230) with RLS. FK-coverage + RLS-wrap enforced globally
 * by schema-health. Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('offline-sync · schema', () => {
  it('queue + device-session tables exist with RLS', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT cl.relname, cl.relrowsecurity FROM pg_class cl JOIN pg_namespace n ON n.oid=cl.relnamespace
        WHERE n.nspname='public' AND cl.relname IN ('erp_offline_mutations','erp_device_sessions') ORDER BY 1`);
      expect(rows.map((r) => r.relname)).toEqual(['erp_device_sessions', 'erp_offline_mutations']);
      expect(rows.every((r) => r.relrowsecurity === true)).toBe(true);
    } finally { await c.end().catch(() => {}); }
  });

  it('mutations are exactly-once (unique idempotency key per company) + status CHECK', async () => {
    const c = await connect();
    try {
      const uq = await c.query(`SELECT indexdef FROM pg_indexes WHERE tablename='erp_offline_mutations' AND indexdef ILIKE '%UNIQUE%company_id%idempotency_key%'`);
      expect(uq.rows.length).toBeGreaterThanOrEqual(1);
      const chk = await c.query(`SELECT string_agg(pg_get_constraintdef(oid),' ') AS d FROM pg_constraint WHERE conrelid='erp_offline_mutations'::regclass AND contype='c'`);
      for (const s of ['pending', 'applied', 'conflict', 'rejected']) expect(chk.rows[0].d).toContain(`'${s}'`);
      for (const o of ['create', 'update', 'delete']) expect(chk.rows[0].d).toContain(`'${o}'`);
    } finally { await c.end().catch(() => {}); }
  });
});
