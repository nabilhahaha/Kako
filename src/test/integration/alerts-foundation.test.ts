import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * Critical Alerts Framework — Phase A1 foundation (0260). Rules resolve global +
 * per-company; alert instances are tenant-isolated and deduped. Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('alerts · foundation', () => {
  it('rules read global + own; alerts are tenant-isolated and deduped', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('AL1') returning id")).rows[0].id;
      const other = (await c.query("insert into erp_companies(name) values('AL2') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ','HQ') returning id", [company])).rows[0].id;
      const user = randomUUID();
      await c.query('insert into auth.users(id, email) values ($1,$2)', [user, `u+${user}@test.local`]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,'admin',true)", [user, branch]);

      // A global rule (seeded by a future phase as data) is readable by any tenant.
      await c.query("insert into erp_alert_rules(company_id, rule_key, source_key) values (null,'low_stock','low_stock')");

      await actAs(c, user);
      expect((await c.query("select count(*)::int n from erp_alert_rules where rule_key='low_stock'")).rows[0].n).toBe(1);

      // Raise an alert; company_id auto-stamps; dedupe is enforced.
      await c.query("insert into erp_alerts(rule_key, source_key, dedupe_key, title) values ('low_stock','low_stock','p:123','Low stock')");
      const dup = await c.query("insert into erp_alerts(rule_key, source_key, dedupe_key, title) values ('low_stock','low_stock','p:123','dup') on conflict (company_id, dedupe_key) do nothing returning id");
      expect(dup.rows.length).toBe(0);   // deduped
      const row = (await c.query("select company_id, status, severity from erp_alerts where dedupe_key='p:123'")).rows[0];
      expect(row).toMatchObject({ company_id: company, status: 'open', severity: 'warning' });
      await resetRole(c);

      // Cross-tenant isolation.
      const ob = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'H2','H2') returning id", [other])).rows[0].id;
      const ou = randomUUID();
      await c.query('insert into auth.users(id, email) values ($1,$2)', [ou, `o+${ou}@test.local`]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,'admin',true)", [ou, ob]);
      await actAs(c, ou);
      expect((await c.query("select count(*)::int n from erp_alerts where dedupe_key='p:123'")).rows[0].n).toBe(0);
      await resetRole(c);
    });
  }, 30_000);
});
