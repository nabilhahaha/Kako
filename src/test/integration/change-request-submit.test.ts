import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * Change Request engine — Phase 2 DB surface. Validates the metadata seed
 * (global `customer` entity + doc-type catalog resolve) and that the request
 * tables enforce tenant isolation + auto-stamp company_id. The submit action's
 * pure orchestration (diff / validation / DFG) is covered by unit tests.
 * Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('change-requests · metadata seed + tenant RLS', () => {
  it('global seed resolves; requests are company-stamped and tenant-isolated', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('CR-E2E') returning id")).rows[0].id;
      const other = (await c.query("insert into erp_companies(name) values('CR-OTHER') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ','HQ') returning id", [company])).rows[0].id;
      const user = randomUUID();
      await c.query('insert into auth.users(id,email) values ($1,$2)', [user, `u+${user}@t.local`]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,'admin',true)", [user, branch]);

      // Global metadata seeded by migration 0253.
      const ent = (await c.query(
        "select target_table, id_column, is_active from erp_change_request_entities where entity_key='customer' and company_id is null",
      )).rows[0];
      expect(ent).toMatchObject({ target_table: 'erp_customers', id_column: 'id', is_active: true });
      const docs = (await c.query('select count(*)::int n from erp_change_request_doc_types where company_id is null')).rows[0].n;
      expect(docs).toBeGreaterThanOrEqual(6);

      // As the company user: the global entity is visible (company_id IS NULL),
      // and a request inserts with auto-stamped company_id (RLS WITH CHECK passes).
      await actAs(c, user);
      expect((await c.query("select count(*)::int n from erp_change_request_entities where entity_key='customer'")).rows[0].n).toBe(1);
      const reqId = (await c.query(
        "insert into erp_change_requests(entity_key,scope,status,requested_by) values ('customer','single','submitted',$1) returning id",
        [user],
      )).rows[0].id;
      await c.query("insert into erp_change_request_targets(request_id,target_id) values ($1,'cust-1')", [reqId]);
      await c.query(
        "insert into erp_change_request_values(request_id,target_id,field_key,old_value,new_value) values ($1,'cust-1','credit_limit','100'::jsonb,'200'::jsonb)",
        [reqId],
      );
      const row = (await c.query('select company_id, status from erp_change_requests where id=$1', [reqId])).rows[0];
      expect(row).toMatchObject({ company_id: company, status: 'submitted' });
      expect((await c.query('select count(*)::int n from erp_change_request_values where request_id=$1', [reqId])).rows[0].n).toBe(1);
      await resetRole(c);

      // Cross-tenant isolation: a user of `other` cannot see the request.
      const otherBranch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ2','HQ2') returning id", [other])).rows[0].id;
      const otherUser = randomUUID();
      await c.query('insert into auth.users(id,email) values ($1,$2)', [otherUser, `o+${otherUser}@t.local`]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,'admin',true)", [otherUser, otherBranch]);
      await actAs(c, otherUser);
      expect((await c.query('select count(*)::int n from erp_change_requests where id=$1', [reqId])).rows[0].n).toBe(0);
      await resetRole(c);
    });
  }, 30_000);
});
