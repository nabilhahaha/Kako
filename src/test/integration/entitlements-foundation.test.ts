import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * Entitlement Engine — E1 foundation (0263). Catalog is read-all; company
 * entitlements are platform-owner-write / company-read; user overrides are
 * tenant-scoped. Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('entitlements · foundation', () => {
  it('catalog readable; entitlements owner-write + company-read; overrides tenant-scoped', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('ENT1') returning id")).rows[0].id;
      const other = (await c.query("insert into erp_companies(name) values('ENT2') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ','HQ') returning id", [company])).rows[0].id;
      const user = randomUUID();
      await c.query('insert into auth.users(id, email) values ($1,$2)', [user, `u+${user}@test.local`]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,'admin',true)", [user, branch]);

      // Catalog (seeded as owner; readable by any tenant user).
      await c.query("insert into erp_modules(module_key,label_en,category) values ('van_sales','Van Sales','engine')");
      await c.query("insert into erp_features(module_key,feature_key,label_en) values ('van_sales','direct_load','Direct load')");
      // Platform-owner-set entitlement for this company.
      await c.query("insert into erp_company_entitlements(company_id,module_key,is_enabled) values ($1,'van_sales',true)", [company]);

      await actAs(c, user);
      expect((await c.query("select count(*)::int n from erp_modules where module_key='van_sales'")).rows[0].n).toBe(1);
      expect((await c.query("select count(*)::int n from erp_features where module_key='van_sales'")).rows[0].n).toBe(1);
      // Company reads its own entitlement…
      expect((await c.query("select is_enabled from erp_company_entitlements where company_id=$1", [company])).rows[0].is_enabled).toBe(true);
      // …but cannot write it (platform-owner only) — RLS blocks the insert.
      // (savepoint so the expected failure doesn't poison the surrounding transaction)
      await c.query('savepoint sp_block');
      let blocked = false;
      try { await c.query("insert into erp_company_entitlements(company_id,module_key,is_enabled) values ($1,'change_requests',true)", [company]); }
      catch { blocked = true; await c.query('rollback to savepoint sp_block'); }
      expect(blocked).toBe(true);
      // Company CAN manage its own user overrides (tenant-scoped).
      await c.query("insert into erp_user_permission_overrides(user_id,permission,grant_type) values ($1,'field.sales','grant')", [user]);
      expect((await c.query('select company_id, grant_type from erp_user_permission_overrides where user_id=$1', [user])).rows[0])
        .toMatchObject({ company_id: company, grant_type: 'grant' });
      await resetRole(c);

      // Cross-tenant cannot see this company's entitlement or override.
      const ob = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'H2','H2') returning id", [other])).rows[0].id;
      const ou = randomUUID();
      await c.query('insert into auth.users(id, email) values ($1,$2)', [ou, `o+${ou}@test.local`]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,'admin',true)", [ou, ob]);
      await actAs(c, ou);
      expect((await c.query("select count(*)::int n from erp_company_entitlements where company_id=$1", [company])).rows[0].n).toBe(0);
      expect((await c.query('select count(*)::int n from erp_user_permission_overrides where user_id=$1', [user])).rows[0].n).toBe(0);
      await resetRole(c);
    });
  }, 30_000);
});
