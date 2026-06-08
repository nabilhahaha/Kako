import { describe, it, expect } from 'vitest';
import { hasTestDb, connect } from '../db';

/**
 * Entity 360 Platform — generic entity timeline (Phase 7) — additive, flag-gated,
 * INERT, IMMUTABLE. Verifies the table exists with RLS and is append-only (SELECT
 * + INSERT only). FK-coverage + RLS-wrap enforced globally by schema-health.
 * Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('entity-timeline · schema', () => {
  it('table exists with RLS', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT relrowsecurity FROM pg_class cl JOIN pg_namespace n ON n.oid=cl.relnamespace
        WHERE n.nspname='public' AND cl.relname='erp_entity_timeline'`);
      expect(rows).toHaveLength(1);
      expect(rows[0].relrowsecurity).toBe(true);
    } finally { await c.end().catch(() => {}); }
  });

  it('is immutable: only SELECT + INSERT policies', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`SELECT cmd FROM pg_policies WHERE schemaname='public' AND tablename='erp_entity_timeline' ORDER BY cmd`);
      const cmds = rows.map((r) => r.cmd);
      expect(cmds).toContain('SELECT');
      expect(cmds).toContain('INSERT');
      expect(cmds).not.toContain('UPDATE');
      expect(cmds).not.toContain('DELETE');
      expect(cmds).not.toContain('ALL');
    } finally { await c.end().catch(() => {}); }
  });
});
