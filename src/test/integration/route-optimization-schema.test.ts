import { describe, it, expect } from 'vitest';
import { hasTestDb, connect } from '../db';

/**
 * Route Optimization & Territory Planning + Ownership History (Phase 3 FMCG) —
 * additive, flag-gated, INERT. Verifies, against the live test DB built from
 * migrations: the ownership ledger + its single-open-interval guard (0214), and
 * territories / membership / seeded frequency rules (0215). FK-coverage + RLS-wrap
 * are enforced globally by schema-health.test.ts. Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('route-optimization · schema', () => {
  it('all four tables exist with RLS enabled', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname IN
          ('erp_ownership_history','erp_territories','erp_territory_customers','erp_visit_frequency_rules')
        ORDER BY 1`);
      expect(rows.map((r) => r.relname)).toEqual([
        'erp_ownership_history', 'erp_territories', 'erp_territory_customers', 'erp_visit_frequency_rules',
      ]);
      expect(rows.every((r) => r.relrowsecurity === true)).toBe(true);
    } finally { await c.end().catch(() => {}); }
  });

  it('ownership history enforces a single open interval per entity/owner dimension', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT indexdef FROM pg_indexes
        WHERE tablename='erp_ownership_history' AND indexname='uq_ownership_history_open'`);
      expect(rows).toHaveLength(1);
      expect(rows[0].indexdef).toContain('effective_to IS NULL');
    } finally { await c.end().catch(() => {}); }
  });

  it('default A/B/C/D frequency rules are seeded (company_id NULL)', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT classification, visits_per_week FROM erp_visit_frequency_rules
        WHERE company_id IS NULL ORDER BY classification`);
      expect(rows.map((r) => r.classification)).toEqual(['a', 'b', 'c', 'd']);
      expect(Number(rows.find((r) => r.classification === 'd').visits_per_week)).toBe(0.5);
    } finally { await c.end().catch(() => {}); }
  });

  it('territory kind CHECK supports city/area/polygon', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid='erp_territories'::regclass AND contype='c'`);
      const defs = rows.map((r) => r.def).join(' ');
      for (const k of ['city', 'area', 'polygon']) expect(defs).toContain(`'${k}'`);
    } finally { await c.end().catch(() => {}); }
  });
});
