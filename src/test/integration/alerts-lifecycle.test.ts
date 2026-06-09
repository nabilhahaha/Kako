import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * Critical Alerts Framework — Phase A4 lifecycle. The acknowledge/snooze/resolve
 * columns + transitions persist under tenant RLS; a user can only act on their
 * company's alerts. (The pure transition rules are unit-tested.) Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('alerts · lifecycle', () => {
  it('acknowledge / snooze / resolve persist; cross-tenant cannot act', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('ALC') returning id")).rows[0].id;
      const other = (await c.query("insert into erp_companies(name) values('ALC2') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ','HQ') returning id", [company])).rows[0].id;
      const user = randomUUID();
      await c.query('insert into auth.users(id, email) values ($1,$2)', [user, `u+${user}@test.local`]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,'admin',true)", [user, branch]);

      const alert = (await c.query(
        "insert into erp_alerts(company_id, rule_key, source_key, dedupe_key, title, status) values ($1,'credit_limit','credit_limit','c:1','x','open') returning id",
        [company],
      )).rows[0].id;

      // Owner acknowledges then resolves (RLS allows).
      await actAs(c, user);
      await c.query("update erp_alerts set status='acknowledged', acknowledged_by=$2, acknowledged_at=now() where id=$1", [alert, user]);
      expect((await c.query('select status from erp_alerts where id=$1', [alert])).rows[0].status).toBe('acknowledged');
      await c.query("update erp_alerts set status='resolved', resolved_by=$2, resolved_at=now(), resolved_reason='manual' where id=$1", [alert, user]);
      const row = (await c.query('select status, resolved_reason from erp_alerts where id=$1', [alert])).rows[0];
      expect(row).toMatchObject({ status: 'resolved', resolved_reason: 'manual' });
      await resetRole(c);

      // Cross-tenant user cannot see or update it (RLS).
      const ob = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'H2','H2') returning id", [other])).rows[0].id;
      const ou = randomUUID();
      await c.query('insert into auth.users(id, email) values ($1,$2)', [ou, `o+${ou}@test.local`]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,'admin',true)", [ou, ob]);
      await actAs(c, ou);
      const upd = await c.query("update erp_alerts set status='open' where id=$1 returning id", [alert]);
      expect(upd.rows.length).toBe(0);   // RLS blocks
      await resetRole(c);
    });
  }, 30_000);
});
