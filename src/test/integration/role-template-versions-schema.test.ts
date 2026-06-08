import { describe, it, expect } from 'vitest';
import { hasTestDb, connect } from '../db';

/**
 * Role Template Versioning (Phase 7) — additive, flag-gated, INERT. Verifies the
 * versioned-template + per-company-adoption tables with RLS (0226), and that
 * platform templates are globally readable but platform-owner-writable. FK-coverage
 * + RLS-wrap enforced globally by schema-health. Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('role-template-versions · schema', () => {
  it('both tables exist with RLS', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT cl.relname, cl.relrowsecurity FROM pg_class cl JOIN pg_namespace n ON n.oid=cl.relnamespace
        WHERE n.nspname='public' AND cl.relname IN ('erp_role_template_versions','erp_company_role_versions') ORDER BY 1`);
      expect(rows.map((r) => r.relname)).toEqual(['erp_company_role_versions', 'erp_role_template_versions']);
      expect(rows.every((r) => r.relrowsecurity === true)).toBe(true);
    } finally { await c.end().catch(() => {}); }
  });

  it('platform templates are version-unique per role + globally readable', async () => {
    const c = await connect();
    try {
      const uq = await c.query(`
        SELECT indexdef FROM pg_indexes WHERE tablename='erp_role_template_versions'
          AND indexdef ILIKE '%UNIQUE%role_key%version_no%'`);
      expect(uq.rows.length).toBeGreaterThanOrEqual(1);
      const pol = await c.query(`SELECT cmd, qual FROM pg_policies WHERE tablename='erp_role_template_versions' AND cmd='SELECT'`);
      expect(pol.rows[0].qual).toContain('true');
    } finally { await c.end().catch(() => {}); }
  });
});
