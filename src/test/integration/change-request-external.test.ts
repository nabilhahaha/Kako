import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * Change Request engine — Phase 8: external approval decisions inbox (0258).
 * Records of decisions received from external systems via the signed callback are
 * tenant-isolated (operators read only their company's). Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('change-requests · external decisions', () => {
  it('records are tenant-isolated', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('CRX') returning id")).rows[0].id;
      const other = (await c.query("insert into erp_companies(name) values('CRX2') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ','HQ') returning id", [company])).rows[0].id;
      const user = randomUUID();
      await c.query('insert into auth.users(id, email) values ($1,$2)', [user, `u+${user}@test.local`]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,'admin',true)", [user, branch]);

      // The callback route (service role) records a verified external decision.
      await c.query(
        "insert into erp_change_request_external_decisions(company_id, task_id, decision, adapter) values ($1,$2,'approve','email')",
        [company, randomUUID()],
      );

      // Same-company operator sees it; another company does not (RLS).
      await actAs(c, user);
      expect((await c.query('select count(*)::int n from erp_change_request_external_decisions')).rows[0].n).toBe(1);
      await resetRole(c);

      const otherBranch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'H2','H2') returning id", [other])).rows[0].id;
      const otherUser = randomUUID();
      await c.query('insert into auth.users(id, email) values ($1,$2)', [otherUser, `o+${otherUser}@test.local`]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,'admin',true)", [otherUser, otherBranch]);
      await actAs(c, otherUser);
      expect((await c.query('select count(*)::int n from erp_change_request_external_decisions')).rows[0].n).toBe(0);
      await resetRole(c);
    });
  }, 30_000);
});
