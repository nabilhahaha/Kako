import { describe, it, expect } from 'vitest';
import { hasTestDb, connect } from '../db';

/**
 * Dynamic Role Governance — data scope / approval authority / temporary access /
 * Entity-360 section security (Phase 7) — additive, flag-gated, INERT. Verifies
 * the four config tables + key CHECKs (0227). FK-coverage + RLS-wrap enforced
 * globally by schema-health. Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('role-governance · schema', () => {
  it('all four governance tables exist with RLS', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT cl.relname, cl.relrowsecurity FROM pg_class cl JOIN pg_namespace n ON n.oid=cl.relnamespace
        WHERE n.nspname='public' AND cl.relname IN
          ('erp_role_data_scopes','erp_approval_authority_rules','erp_temporary_access_grants','erp_entity360_section_access')
        ORDER BY 1`);
      expect(rows.map((r) => r.relname)).toEqual([
        'erp_approval_authority_rules', 'erp_entity360_section_access', 'erp_role_data_scopes', 'erp_temporary_access_grants',
      ]);
      expect(rows.every((r) => r.relrowsecurity === true)).toBe(true);
    } finally { await c.end().catch(() => {}); }
  });

  it('data scope + approval dimension CHECKs are enforced', async () => {
    const c = await connect();
    try {
      const ds = await c.query(`SELECT string_agg(pg_get_constraintdef(oid),' ') AS d FROM pg_constraint WHERE conrelid='erp_role_data_scopes'::regclass AND contype='c'`);
      for (const s of ['own', 'team', 'area', 'region', 'branch', 'company', 'custom']) expect(ds.rows[0].d).toContain(`'${s}'`);
      const aa = await c.query(`SELECT string_agg(pg_get_constraintdef(oid),' ') AS d FROM pg_constraint WHERE conrelid='erp_approval_authority_rules'::regclass AND contype='c'`);
      for (const dim of ['amount', 'discount_pct', 'credit_limit', 'promotion_budget']) expect(aa.rows[0].d).toContain(`'${dim}'`);
    } finally { await c.end().catch(() => {}); }
  });
});
