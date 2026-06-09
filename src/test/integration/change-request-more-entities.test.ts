import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * Change Request engine — Phase 11: more entities (0259). Governing a new entity
 * is metadata: Products/Suppliers/Routes are registered globally and apply through
 * the SAME generic engine. Proven here for a product price change. Also asserts the
 * data-driven apply allowlist. Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('change-requests · more entities', () => {
  it('product/supplier/route are registered with default workflows', async () => {
    await withRollback(async (c) => {
      const ents = (await c.query(
        "select entity_key, target_table from erp_change_request_entities where company_id is null and entity_key in ('product','supplier','route') order by entity_key",
      )).rows;
      expect(ents).toEqual([
        { entity_key: 'product', target_table: 'erp_products_catalog' },
        { entity_key: 'route', target_table: 'erp_routes' },
        { entity_key: 'supplier', target_table: 'erp_suppliers' },
      ]);
      const defs = (await c.query(
        "select count(*)::int n from erp_workflow_definitions where company_id is null and key in ('change_request:product','change_request:supplier','change_request:route')",
      )).rows[0].n;
      expect(defs).toBe(3);
      const allow = (await c.query('select count(*)::int n from erp_change_request_apply_tables')).rows[0].n;
      expect(Number(allow)).toBeGreaterThanOrEqual(4);
    });
  }, 30_000);

  it('applies a product price change through the generic engine', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('CRM') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ','HQ') returning id", [company])).rows[0].id;
      const user = randomUUID();
      await c.query('insert into auth.users(id, email) values ($1,$2)', [user, `u+${user}@test.local`]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,'admin',true)", [user, branch]);
      const product = (await c.query(
        "insert into erp_products_catalog(company_id,code,name,sell_price) values ($1,$2,'P',10) returning id",
        [company, `P-${randomUUID().slice(0, 6)}`],
      )).rows[0].id;

      await actAs(c, user);
      const cr = (await c.query("insert into erp_change_requests(entity_key,scope,status,requested_by) values ('product','single','approved',$1) returning id", [user])).rows[0].id;
      await c.query('insert into erp_change_request_targets(request_id,target_id) values ($1,$2)', [cr, product]);
      await c.query("insert into erp_change_request_values(request_id,target_id,field_key,new_value) values ($1,$2,'sell_price','25'::jsonb)", [cr, product]);
      await resetRole(c);

      expect((await c.query('select erp_change_request_apply($1) as s', [cr])).rows[0].s).toBe('applied');
      expect(Number((await c.query('select sell_price from erp_products_catalog where id=$1', [product])).rows[0].sell_price)).toBe(25);
    });
  }, 30_000);
});
