import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hasTestDb, withRollback } from '../db';

/**
 * Temporary-access expiry sweep (0237) — erp_sweep_expired_access() stamps
 * `expired_at` on lapsed grants (effective_to < now()) and leaves still-active
 * grants untouched. Non-destructive (stamps, never deletes). Gated on
 * TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('access expiry sweep · erp_sweep_expired_access', () => {
  it('stamps expired grants, leaves active ones', async () => {
    await withRollback(async (c) => {
      const company = (await c.query('insert into erp_companies(name) values ($1) returning id', ['SweepCo'])).rows[0].id;
      const user = randomUUID();
      // One lapsed grant, one still-active.
      const lapsed = (await c.query(
        `insert into erp_temporary_access_grants(company_id,user_id,grant_key,effective_from,effective_to)
         values ($1,$2,'reports.view', now() - interval '10 days', now() - interval '1 day') returning id`,
        [company, user],
      )).rows[0].id;
      const active = (await c.query(
        `insert into erp_temporary_access_grants(company_id,user_id,grant_key,effective_from,effective_to)
         values ($1,$2,'reports.view', now() - interval '1 day', now() + interval '7 days') returning id`,
        [company, user],
      )).rows[0].id;

      const swept = await c.query('select erp_sweep_expired_access() as n');
      expect(Number(swept.rows[0].n)).toBeGreaterThanOrEqual(1);

      const lapsedRow = await c.query('select expired_at from erp_temporary_access_grants where id=$1', [lapsed]);
      const activeRow = await c.query('select expired_at from erp_temporary_access_grants where id=$1', [active]);
      expect(lapsedRow.rows[0].expired_at).not.toBeNull();
      expect(activeRow.rows[0].expired_at).toBeNull();

      // Idempotent: a second sweep doesn't re-stamp the already-expired grant.
      const before = (await c.query('select expired_at from erp_temporary_access_grants where id=$1', [lapsed])).rows[0].expired_at;
      await c.query('select erp_sweep_expired_access()');
      const after = (await c.query('select expired_at from erp_temporary_access_grants where id=$1', [lapsed])).rows[0].expired_at;
      expect(String(after)).toBe(String(before));
    });
  });
});
