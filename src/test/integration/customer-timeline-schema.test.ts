import { describe, it, expect } from 'vitest';
import { hasTestDb, connect } from '../db';

/**
 * Customer Relationship Timeline (Phase 3 FMCG) — additive, flag-gated, INERT,
 * IMMUTABLE. Verifies, against the live test DB built from migrations: the table
 * exists with RLS and is append-only (SELECT + INSERT policies only — no
 * UPDATE/DELETE). FK-coverage + RLS-wrap enforced globally by schema-health.
 * Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('customer-timeline · schema', () => {
  it('table exists with RLS enabled', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT relrowsecurity FROM pg_class cl JOIN pg_namespace n ON n.oid=cl.relnamespace
        WHERE n.nspname='public' AND cl.relname='erp_customer_timeline'`);
      expect(rows).toHaveLength(1);
      expect(rows[0].relrowsecurity).toBe(true);
    } finally { await c.end().catch(() => {}); }
  });

  it('is immutable: only SELECT + INSERT policies (no UPDATE/DELETE)', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT cmd FROM pg_policies WHERE schemaname='public' AND tablename='erp_customer_timeline' ORDER BY cmd`);
      const cmds = rows.map((r) => r.cmd);
      expect(cmds).toContain('SELECT');
      expect(cmds).toContain('INSERT');
      expect(cmds).not.toContain('UPDATE');
      expect(cmds).not.toContain('DELETE');
      expect(cmds).not.toContain('ALL');
    } finally { await c.end().catch(() => {}); }
  });

  it('has the full attribution column set', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='erp_customer_timeline'
          AND column_name IN ('event_type','event_category','event_at','user_id','role','source_module',
            'before_value','after_value','reason','notes','related_record_type','related_record_id',
            'related_entity','attachment_ref')`);
      expect(rows).toHaveLength(14);
    } finally { await c.end().catch(() => {}); }
  });
});
