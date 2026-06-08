import { describe, it, expect } from 'vitest';
import { hasTestDb, connect } from '../db';

/**
 * Suggested Load & Demand Engine (Phase 7E) — additive, flag-gated, INERT.
 * Verifies the suggested-load header + lines (0233) with RLS + status CHECK.
 * FK-coverage + RLS-wrap enforced globally by schema-health. Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('suggested-load · schema', () => {
  it('header + lines tables exist with RLS', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT cl.relname, cl.relrowsecurity FROM pg_class cl JOIN pg_namespace n ON n.oid=cl.relnamespace
        WHERE n.nspname='public' AND cl.relname IN ('erp_suggested_loads','erp_suggested_load_lines') ORDER BY 1`);
      expect(rows.map((r) => r.relname)).toEqual(['erp_suggested_load_lines', 'erp_suggested_loads']);
      expect(rows.every((r) => r.relrowsecurity === true)).toBe(true);
    } finally { await c.end().catch(() => {}); }
  });

  it('status CHECK covers suggested/loaded/cancelled', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`SELECT string_agg(pg_get_constraintdef(oid),' ') AS d FROM pg_constraint WHERE conrelid='erp_suggested_loads'::regclass AND contype='c'`);
      for (const s of ['suggested', 'loaded', 'cancelled']) expect(rows[0].d).toContain(`'${s}'`);
    } finally { await c.end().catch(() => {}); }
  });
});
