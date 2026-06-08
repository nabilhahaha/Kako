import { describe, it, expect } from 'vitest';
import { hasTestDb, connect } from '../db';

/**
 * Perfect Store Engine (Phase 7C) — additive, flag-gated, INERT. Verifies the
 * configurable scorecards + outlet/period score snapshot (0231) with RLS.
 * FK-coverage + RLS-wrap enforced globally by schema-health. Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('perfect-store · schema', () => {
  it('scorecard + score tables exist with RLS', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT cl.relname, cl.relrowsecurity FROM pg_class cl JOIN pg_namespace n ON n.oid=cl.relnamespace
        WHERE n.nspname='public' AND cl.relname IN ('erp_perfect_store_scorecards','erp_perfect_store_scores') ORDER BY 1`);
      expect(rows.map((r) => r.relname)).toEqual(['erp_perfect_store_scorecards', 'erp_perfect_store_scores']);
      expect(rows.every((r) => r.relrowsecurity === true)).toBe(true);
    } finally { await c.end().catch(() => {}); }
  });

  it('scores are unique per company/customer/period', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`SELECT indexdef FROM pg_indexes WHERE tablename='erp_perfect_store_scores' AND indexdef ILIKE '%UNIQUE%company_id%customer_id%period%'`);
      expect(rows.length).toBeGreaterThanOrEqual(1);
    } finally { await c.end().catch(() => {}); }
  });
});
