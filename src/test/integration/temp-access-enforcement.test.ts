import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hasTestDb, withRollback } from '../db';

/**
 * Temporary-access enforcement query (Step 2) — the exact filter getUserContext
 * uses to union ACTIVE grants: company + user scoped, within the effective window,
 * and NOT expired (expired_at IS NULL). Proves only the active grant is selected.
 * Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('temp-access enforcement · active-grant selection', () => {
  it('selects only the active, non-expired grant for the right user+company', async () => {
    await withRollback(async (c) => {
      const coA = (await c.query('insert into erp_companies(name) values ($1) returning id', ['TaCoA'])).rows[0].id;
      const coB = (await c.query('insert into erp_companies(name) values ($1) returning id', ['TaCoB'])).rows[0].id;
      const user = randomUUID();
      const other = randomUUID();
      const mk = async (company: string, uid: string, key: string, from: string, to: string, expired: string | null) =>
        c.query(
          `insert into erp_temporary_access_grants(company_id,user_id,grant_key,effective_from,effective_to,expired_at)
           values ($1,$2,$3, now() + ($4)::interval, now() + ($5)::interval, $6)`,
          [company, uid, key, from, to, expired],
        );
      await mk(coA, user, 'reports.view', '-1 day', '7 days', null);     // ACTIVE
      await mk(coA, user, 'sales.collect', '-10 days', '-1 day', null);  // window lapsed
      await mk(coA, user, 'pricing.manage', '-1 day', '7 days', new Date().toISOString()); // expired_at stamped
      await mk(coA, other, 'accounting.view', '-1 day', '7 days', null); // wrong user
      await mk(coB, user, 'inventory.view', '-1 day', '7 days', null);   // wrong company

      const now = new Date().toISOString();
      const { rows } = await c.query(
        `select grant_key from erp_temporary_access_grants
          where company_id=$1 and user_id=$2 and expired_at is null
            and effective_from <= $3 and effective_to >= $3`,
        [coA, user, now],
      );
      expect(rows.map((r) => r.grant_key)).toEqual(['reports.view']);
    });
  });
});
