import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hasTestDb, withRollback } from '../db';

/**
 * Role Permission Overrides (0347) — role-level overrides on the same engine
 * (kind='role_override', role_key set, user_id NULL). Verifies the schema shape,
 * the role-resolution query, the partial unique index, the delegability guard,
 * and that user overrides win over role overrides. Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('role permission overrides · schema + resolution', () => {
  it('role override row: role_key set, user_id NULL, reason required', async () => {
    await withRollback(async (c) => {
      const co = (await c.query('insert into erp_companies(name) values ($1) returning id', ['RoCo'])).rows[0].id;
      await c.query(
        `insert into erp_temporary_access_grants(company_id,role_key,grant_key,kind,effect,reason)
         values ($1,'salesman','customer.request','role_override','grant','pilot')`, [co]);
      const { rows } = await c.query(
        `select role_key, user_id, effect from erp_temporary_access_grants where company_id=$1 and kind='role_override'`, [co]);
      expect(rows[0].role_key).toBe('salesman');
      expect(rows[0].user_id).toBeNull();
      // missing reason rejected
      await c.query('savepoint sp');
      await expect(
        c.query(`insert into erp_temporary_access_grants(company_id,role_key,grant_key,kind,effect)
                 values ($1,'cashier','returns.create','role_override','grant')`, [co]),
      ).rejects.toThrow();
      await c.query('rollback to savepoint sp');
    });
  });

  it('at most one role override per (company, role, permission)', async () => {
    await withRollback(async (c) => {
      const co = (await c.query('insert into erp_companies(name) values ($1) returning id', ['RoCo2'])).rows[0].id;
      await c.query(`insert into erp_temporary_access_grants(company_id,role_key,grant_key,kind,effect,reason)
                     values ($1,'salesman','customer.request','role_override','grant','a')`, [co]);
      await c.query('savepoint sp');
      await expect(
        c.query(`insert into erp_temporary_access_grants(company_id,role_key,grant_key,kind,effect,reason)
                 values ($1,'salesman','customer.request','role_override','revoke','b')`, [co]),
      ).rejects.toThrow();
      await c.query('rollback to savepoint sp');
    });
  });

  it('non-delegable role override rejected by erp_is_delegable_permission', async () => {
    await withRollback(async (c) => {
      const co = (await c.query('insert into erp_companies(name) values ($1) returning id', ['RoCo3'])).rows[0].id;
      const ok = await c.query(`select erp_is_delegable_permission('customer.request',$1) d`, [co]);
      const no = await c.query(`select erp_is_delegable_permission('accounting.post',$1) d`, [co]);
      expect(ok.rows[0].d).toBe(true);
      expect(no.rows[0].d).toBe(false);
    });
  });

  it('user override wins over role override (resolution query)', async () => {
    await withRollback(async (c) => {
      const co = (await c.query('insert into erp_companies(name) values ($1) returning id', ['RoCo4'])).rows[0].id;
      const ahmed = randomUUID();
      // role grants customer.request to all salesmen
      await c.query(`insert into erp_temporary_access_grants(company_id,role_key,grant_key,kind,effect,reason)
                     values ($1,'salesman','customer.request','role_override','grant','role')`, [co]);
      // Ahmed (a salesman) has a user revoke
      await c.query(`insert into erp_temporary_access_grants(company_id,user_id,grant_key,kind,effect,reason)
                     values ($1,$2,'customer.request','override','revoke','user wins')`, [co, ahmed]);
      // resolve: base (empty) → role grants → user revoke
      const { rows } = await c.query(
        `with role_layer as (
           select grant_key from erp_temporary_access_grants
           where company_id=$1 and kind='role_override' and role_key='salesman' and effect='grant'
         ),
         user_revokes as (
           select grant_key from erp_temporary_access_grants
           where company_id=$1 and user_id=$2 and kind='override' and effect='revoke'
         )
         select grant_key from role_layer where grant_key not in (select grant_key from user_revokes)`,
        [co, ahmed]);
      expect(rows.map((r) => r.grant_key)).toEqual([]); // Ahmed does NOT get it
    });
  });
});
