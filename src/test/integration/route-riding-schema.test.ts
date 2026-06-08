import { describe, it, expect } from 'vitest';
import { hasTestDb, connect } from '../db';

/**
 * Route Riding Excellence module (Phase 3 FMCG) — additive, flag-gated, INERT.
 * Verifies, against the live test DB built from migrations: the criteria catalog
 * + seeded platform defaults (0212), and the rides/customers/evaluations/actions
 * tables with RLS (0213). FK-coverage + RLS-wrap are enforced globally by
 * schema-health.test.ts. Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('route-riding · schema', () => {
  it('all five tables exist with RLS enabled', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT c.relname, c.relrowsecurity
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname='public' AND c.relname IN
          ('erp_route_ride_criteria','erp_route_rides','erp_route_ride_customers',
           'erp_route_ride_evaluations','erp_route_ride_actions')
        ORDER BY 1`);
      expect(rows.map((r) => r.relname)).toEqual([
        'erp_route_ride_actions', 'erp_route_ride_criteria', 'erp_route_ride_customers',
        'erp_route_ride_evaluations', 'erp_route_rides',
      ]);
      expect(rows.every((r) => r.relrowsecurity === true)).toBe(true);
    } finally { await c.end().catch(() => {}); }
  });

  it('platform default criteria are seeded (25 across 6 categories)', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT count(*)::int AS n, count(DISTINCT category)::int AS cats
        FROM erp_route_ride_criteria WHERE company_id IS NULL`);
      expect(rows[0].n).toBe(25);
      expect(rows[0].cats).toBe(6);
    } finally { await c.end().catch(() => {}); }
  });

  it('seed is idempotent (re-running the INSERT adds nothing)', async () => {
    const c = await connect();
    try {
      await c.query(`
        INSERT INTO erp_route_ride_criteria (company_id, category, code, label, weight, max_score, sort)
        SELECT NULL, 'merchandising', 'msl_compliance', 'MSL Compliance', 1, 5, 170
        WHERE NOT EXISTS (SELECT 1 FROM erp_route_ride_criteria WHERE company_id IS NULL AND code='msl_compliance')`);
      const { rows } = await c.query(`SELECT count(*)::int AS n FROM erp_route_ride_criteria WHERE company_id IS NULL`);
      expect(rows[0].n).toBe(25);
    } finally { await c.end().catch(() => {}); }
  });

  it('ride status + ride_type CHECKs cover the lifecycle/types', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT string_agg(pg_get_constraintdef(oid), ' ') AS defs FROM pg_constraint
        WHERE conrelid='erp_route_rides'::regclass AND contype='c'`);
      for (const s of ['pending_acknowledgement', 'acknowledged', 'corrective_action', 'regional_manager'])
        expect(rows[0].defs).toContain(`'${s}'`);
    } finally { await c.end().catch(() => {}); }
  });
});
