import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/** Dynamic Form & Workflow Builder — B1 integration tests: data model, RLS,
 *  audit capture, and versioning. Gated on TEST_DATABASE_URL. */

async function seedTenant(c: Client, tag: string): Promise<{ company: string; branch: string; admin: string }> {
  const company = (await c.query("insert into erp_companies(name) values($1) returning id", [`FB_${tag}`])).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id, code, name) values($1,$2,'Br') returning id", [company, `B${tag}`.slice(0, 8)])).rows[0].id;
  const admin = randomUUID();
  await c.query("insert into auth.users(id, email) values($1,$2)", [admin, `a_${tag}@fb.local`]);
  await c.query("insert into erp_user_branches(user_id, branch_id, role, is_default) values($1,$2,'admin',true)", [admin, branch]);
  return { company, branch, admin };
}

describe.skipIf(!hasTestDb)('form builder B1 · definitions, fields, RLS, audit, versioning', () => {
  it('a company admin creates a form + fields and reads them back', async () => {
    await withRollback(async (c) => {
      const t = await seedTenant(c, 'CRUD');
      await actAs(c, t.admin);
      const form = (await c.query(
        "insert into erp_form_definitions(company_id, key, name_en, module, target_entity, workflow_key) values($1,'new_customer','New Customer','crm','customer','credit_limit_approval') returning id",
        [t.company],
      )).rows[0].id;
      await c.query("insert into erp_form_fields(form_id, key, label_en, type, required, sort_order) values($1,'cust_name','Name','text',true,1)", [form]);
      await c.query("insert into erp_form_fields(form_id, key, label_en, type, sort_order) values($1,'gps','Location','gps',2)", [form]);
      const fields = await c.query("select type from erp_form_fields where form_id=$1 order by sort_order", [form]);
      expect(fields.rows.map((r) => r.type)).toEqual(['text', 'gps']);
    });
  }, 30_000);

  it('forms are tenant-isolated; global templates are readable by all', async () => {
    await withRollback(async (c) => {
      const a = await seedTenant(c, 'ISO_A');
      const b = await seedTenant(c, 'ISO_B');
      // global template (company_id NULL) inserted as owner
      const tpl = (await c.query("insert into erp_form_definitions(company_id, key, name_en) values(null,'tpl','Template') returning id")).rows[0].id;
      // company A form
      await actAs(c, a.admin);
      const aForm = (await c.query("insert into erp_form_definitions(company_id, key, name_en) values($1,'a_only','A') returning id", [a.company])).rows[0].id;
      await resetRole(c);

      await actAs(c, b.admin);
      const seesTpl = await c.query("select 1 from erp_form_definitions where id=$1", [tpl]);
      const seesA = await c.query("select 1 from erp_form_definitions where id=$1", [aForm]);
      expect(seesTpl.rowCount).toBe(1);  // global template visible
      expect(seesA.rowCount).toBe(0);    // other tenant's form invisible
    });
  }, 30_000);

  it('form definition changes are audited (before/after)', async () => {
    await withRollback(async (c) => {
      const t = await seedTenant(c, 'AUD');
      await actAs(c, t.admin);
      const form = (await c.query("insert into erp_form_definitions(company_id, key, name_en, status) values($1,'f','F','draft') returning id", [t.company])).rows[0].id;
      await c.query("update erp_form_definitions set status='active' where id=$1", [form]);
      const created = await c.query("select 1 from erp_audit_logs where entity='form_definitions' and entity_id=$1 and action='create'", [form]);
      const updated = (await c.query("select change_set, old_value, new_value from erp_audit_logs where entity='form_definitions' and entity_id=$1 and action='update' limit 1", [form])).rows[0];
      expect(created.rowCount).toBe(1);
      expect(updated.change_set).toContain('status');
      expect(updated.old_value.status).toBe('draft');
      expect(updated.new_value.status).toBe('active');
    });
  }, 30_000);

  it('new version clones fields and flips is_latest', async () => {
    await withRollback(async (c) => {
      const t = await seedTenant(c, 'VER');
      await actAs(c, t.admin);
      const form = (await c.query("insert into erp_form_definitions(company_id, key, name_en) values($1,'v','V') returning id", [t.company])).rows[0].id;
      await c.query("insert into erp_form_fields(form_id, key, label_en, type) values($1,'x','X','text')", [form]);
      const v2 = (await c.query("select erp_form_new_version($1) as id", [form])).rows[0].id;

      const newDef = (await c.query("select version, is_latest from erp_form_definitions where id=$1", [v2])).rows[0];
      const oldDef = (await c.query("select is_latest from erp_form_definitions where id=$1", [form])).rows[0];
      const newFields = await c.query("select key from erp_form_fields where form_id=$1", [v2]);
      expect(Number(newDef.version)).toBe(2);
      expect(newDef.is_latest).toBe(true);
      expect(oldDef.is_latest).toBe(false);
      expect(newFields.rows.map((r) => r.key)).toEqual(['x']);
    });
  }, 30_000);
});
