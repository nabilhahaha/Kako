import { describe, it, expect } from 'vitest';
import { hasTestDb, connect } from '../db';

/**
 * Form Builder (0240) — forms + versions + immutable responses exist with RLS.
 * Responses are SELECT+INSERT only (no UPDATE/DELETE policy). Global forms read
 * via the NULL-company clause. FK-coverage + RLS-wrap enforced by schema-health.
 * Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('form-builder · schema', () => {
  it('tables exist with RLS enabled', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT cl.relname, cl.relrowsecurity FROM pg_class cl JOIN pg_namespace n ON n.oid=cl.relnamespace
        WHERE n.nspname='public' AND cl.relname IN ('erp_forms','erp_form_versions','erp_form_responses') ORDER BY 1`);
      expect(rows.map((r) => r.relname)).toEqual(['erp_form_responses', 'erp_form_versions', 'erp_forms']);
      expect(rows.every((r) => r.relrowsecurity === true)).toBe(true);
    } finally { await c.end().catch(() => {}); }
  });

  it('responses are immutable (no UPDATE/DELETE policy) + version status CHECK', async () => {
    const c = await connect();
    try {
      const pol = await c.query(`SELECT cmd FROM pg_policies WHERE tablename='erp_form_responses'`);
      const cmds = pol.rows.map((r) => r.cmd);
      expect(cmds).toContain('SELECT');
      expect(cmds).toContain('INSERT');
      expect(cmds).not.toContain('UPDATE');
      expect(cmds).not.toContain('DELETE');
      const chk = await c.query(`SELECT string_agg(pg_get_constraintdef(oid),' ') d FROM pg_constraint WHERE conrelid='erp_form_versions'::regclass AND contype='c'`);
      for (const s of ['draft', 'published', 'archived']) expect(chk.rows[0].d).toContain(`'${s}'`);
    } finally { await c.end().catch(() => {}); }
  });
});
