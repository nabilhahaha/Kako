import { describe, it, expect } from 'vitest';
import { hasTestDb, connect } from '../db';

/**
 * Route & Territory Intelligence (Phase 7D) — additive, flag-gated, INERT.
 * Verifies the health-snapshot table (0232) with RLS + the entity-type CHECK.
 * FK-coverage + RLS-wrap enforced globally by schema-health. Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('route-intel · schema', () => {
  it('health snapshot table exists with RLS + entity-type CHECK', async () => {
    const c = await connect();
    try {
      const t = await c.query(`
        SELECT relrowsecurity FROM pg_class cl JOIN pg_namespace n ON n.oid=cl.relnamespace
        WHERE n.nspname='public' AND cl.relname='erp_intel_health_snapshots'`);
      expect(t.rows).toHaveLength(1);
      expect(t.rows[0].relrowsecurity).toBe(true);
      const chk = await c.query(`SELECT string_agg(pg_get_constraintdef(oid),' ') AS d FROM pg_constraint WHERE conrelid='erp_intel_health_snapshots'::regclass AND contype='c'`);
      for (const e of ['route', 'salesman', 'territory', 'supervisor']) expect(chk.rows[0].d).toContain(`'${e}'`);
    } finally { await c.end().catch(() => {}); }
  });
});
