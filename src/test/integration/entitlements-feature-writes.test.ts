import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * Entitlement Engine — E5 company feature writes (0265). A Company Admin may write
 * FEATURE-level rows for their own company; module-level rows stay platform-owner-only.
 * (The "module must be enabled" cap is enforced in the server action, not RLS.)
 * Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('entitlements · company feature writes', () => {
  it('feature writes allowed for the company; module-level stays owner-only', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('ENTF') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ','HQ') returning id", [company])).rows[0].id;
      const user = randomUUID();
      await c.query('insert into auth.users(id, email) values ($1,$2)', [user, `u+${user}@test.local`]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,'admin',true)", [user, branch]);
      // Platform owner enabled the van_sales module for this company.
      await c.query("insert into erp_company_entitlements(company_id,module_key,is_enabled) values ($1,'van_sales',true)", [company]);

      await actAs(c, user);
      // Allowed: a feature row for the ENABLED module.
      await c.query("insert into erp_company_entitlements(company_id,module_key,feature_key,is_enabled) values ($1,'van_sales','direct_load',false)", [company]);
      expect((await c.query("select is_enabled from erp_company_entitlements where company_id=$1 and module_key='van_sales' and feature_key='direct_load'", [company])).rows[0].is_enabled).toBe(false);

      // Denied: a module-level row (platform-owner only).
      await c.query('savepoint sp2');
      let moduleBlocked = false;
      try { await c.query("insert into erp_company_entitlements(company_id,module_key,is_enabled) values ($1,'change_requests',true)", [company]); }
      catch { moduleBlocked = true; await c.query('rollback to savepoint sp2'); }
      expect(moduleBlocked).toBe(true);
      await resetRole(c);
    });
  }, 30_000);
});
