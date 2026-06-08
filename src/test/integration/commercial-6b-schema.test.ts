import { describe, it, expect } from 'vitest';
import { hasTestDb, connect } from '../db';

/**
 * Commercial Excellence 6B — forecasts + master data governance (Phase 7) —
 * additive, flag-gated, INERT. Verifies the new tables + the immutable MDG audit
 * log (0224–0225). FK-coverage + RLS-wrap enforced globally by schema-health.
 * Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('commercial-6b · schema', () => {
  it('forecasts + MDG tables exist with RLS', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname IN ('erp_forecasts','erp_mdg_change_requests','erp_mdg_audit_log') ORDER BY 1`);
      expect(rows.map((r) => r.relname)).toEqual(['erp_forecasts', 'erp_mdg_audit_log', 'erp_mdg_change_requests']);
      expect(rows.every((r) => r.relrowsecurity === true)).toBe(true);
    } finally { await c.end().catch(() => {}); }
  });

  it('MDG audit log is immutable (SELECT + INSERT only)', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`SELECT cmd FROM pg_policies WHERE schemaname='public' AND tablename='erp_mdg_audit_log' ORDER BY cmd`);
      const cmds = rows.map((r) => r.cmd);
      expect(cmds).toContain('SELECT');
      expect(cmds).toContain('INSERT');
      expect(cmds).not.toContain('UPDATE');
      expect(cmds).not.toContain('DELETE');
      expect(cmds).not.toContain('ALL');
    } finally { await c.end().catch(() => {}); }
  });

  it('forecast_type + MDG entity CHECKs are enforced', async () => {
    const c = await connect();
    try {
      const f = await c.query(`SELECT string_agg(pg_get_constraintdef(oid),' ') AS d FROM pg_constraint WHERE conrelid='erp_forecasts'::regclass AND contype='c'`);
      for (const t of ['sales', 'customer', 'route', 'sku', 'brand']) expect(f.rows[0].d).toContain(`'${t}'`);
      const m = await c.query(`SELECT string_agg(pg_get_constraintdef(oid),' ') AS d FROM pg_constraint WHERE conrelid='erp_mdg_change_requests'::regclass AND contype='c'`);
      for (const e of ['vat', 'gps', 'supplier', 'territory']) expect(m.rows[0].d).toContain(`'${e}'`);
    } finally { await c.end().catch(() => {}); }
  });
});
