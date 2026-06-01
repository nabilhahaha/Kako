import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * Integration + RLS tests for the Workflow & Approval Engine and the Platform
 * Foundations (canonical subscription projection, permission matrix, audit
 * capture, notification engine, raw-data framework, Customer 360). Run against a
 * real Postgres via TEST_DATABASE_URL; otherwise skipped. Everything runs inside
 * a rolled-back transaction.
 */

interface Tenant { company: string; branch: string; admin: string }

async function seedTenant(c: Client, tag: string): Promise<Tenant> {
  const company = (await c.query("insert into erp_companies(name) values($1) returning id", [`ITEST_${tag}`])).rows[0].id;
  const branch = (await c.query(
    "insert into erp_branches(company_id, code, name, region, area) values($1,$2,'Br','North','A1') returning id",
    [company, `B${tag}`.slice(0, 8)],
  )).rows[0].id;
  const admin = randomUUID();
  await c.query("insert into auth.users(id, email) values($1, $2)", [admin, `admin_${tag}@itest.local`]); // profile auto-created
  await c.query("insert into erp_user_branches(user_id, branch_id, role, is_default) values($1,$2,'admin',true)", [admin, branch]);
  return { company, branch, admin };
}

describe.skipIf(!hasTestDb)('foundations · workflow engine (company scope)', () => {
  it('start → decide produces tasks, events and workflow-linked audit', async () => {
    await withRollback(async (c) => {
      const t = await seedTenant(c, 'WF');
      const def = (await c.query(
        "insert into erp_workflow_definitions(company_id, key, entity, scope) values($1,'itest_wf','itest_entity','company') returning id",
        [t.company],
      )).rows[0].id;
      await c.query(
        "insert into erp_workflow_steps(definition_id, step_no, approver_type, mode, required_approvals) values($1,1,'company_admin','sequential',1)",
        [def],
      );

      await actAs(c, t.admin);
      const inst = (await c.query("select erp_workflow_start('itest_wf','itest_entity','rec-1','{}'::jsonb) as id")).rows[0].id;
      expect(inst).toBeTruthy();

      const instRow = (await c.query("select status, scope from erp_workflow_instances where id=$1", [inst])).rows[0];
      expect(instRow.status).toBe('pending');
      expect(instRow.scope).toBe('company');

      const task = (await c.query("select id, assignee_type, status from erp_workflow_tasks where instance_id=$1", [inst])).rows[0];
      expect(task.assignee_type).toBe('company_admin');

      const submitted = await c.query("select 1 from erp_workflow_events where instance_id=$1 and event='submitted'", [inst]);
      expect(submitted.rowCount).toBe(1);
      const auditSubmit = await c.query("select 1 from erp_audit_logs where entity='workflow_instance' and entity_id=$1 and workflow_instance_id=$1::uuid", [inst]);
      expect(auditSubmit.rowCount).toBeGreaterThanOrEqual(1);

      await c.query("select erp_workflow_decide($1,'approve',null)", [task.id]);
      const after = (await c.query("select status from erp_workflow_instances where id=$1", [inst])).rows[0];
      expect(after.status).toBe('approved');
      const decided = await c.query("select 1 from erp_workflow_events where instance_id=$1 and event='decided'", [inst]);
      expect(decided.rowCount).toBe(1);
      const auditApprove = await c.query("select 1 from erp_audit_logs where entity='workflow_task' and action='approve' and workflow_instance_id=$1::uuid", [inst]);
      expect(auditApprove.rowCount).toBe(1);
    });
  }, 30_000);
});

describe.skipIf(!hasTestDb)('foundations · canonical subscription projection', () => {
  it('projects the billing subscription onto the company cache', async () => {
    await withRollback(async (c) => {
      const t = await seedTenant(c, 'SUB');
      // Insert a canonical subscription (as owner role); the projection trigger
      // updates the company cache.
      await c.query(
        `insert into erp_billing_subscriptions(company_id, plan_key, currency, interval, status, current_period_start, current_period_end)
         values($1,'standard','EGP','monthly','active', current_date, current_date + 30)`,
        [t.company],
      );
      const co = (await c.query("select plan_key, is_active, subscription_end from erp_companies where id=$1", [t.company])).rows[0];
      expect(co.plan_key).toBe('standard');
      expect(co.is_active).toBe(true);
      expect(co.subscription_end).not.toBeNull();
    });
  }, 30_000);
});

describe.skipIf(!hasTestDb)('foundations · permission matrix', () => {
  it('resolves global defaults and company overrides', async () => {
    await withRollback(async (c) => {
      const t = await seedTenant(c, 'PM');
      const sales = randomUUID();
      await c.query("insert into auth.users(id, email) values($1,$2)", [sales, 'sales_pm@itest.local']);
      await c.query("insert into erp_user_branches(user_id, branch_id, role, is_default) values($1,$2,'salesman',true)", [sales, t.branch]);

      await actAs(c, sales);
      expect((await c.query("select erp_matrix_has('customers','view') as v")).rows[0].v).toBe(true);   // global default
      expect((await c.query("select erp_matrix_has('customers','delete') as v")).rows[0].v).toBe(false);
      await resetRole(c);

      // Company override for salesman replaces the global defaults for that role.
      await c.query("insert into erp_matrix_role_permissions(company_id, role_key, permission) values($1,'salesman','customers:delete')", [t.company]);
      await actAs(c, sales);
      expect((await c.query("select erp_matrix_has('customers','delete') as v")).rows[0].v).toBe(true);
      expect((await c.query("select erp_matrix_has('customers','view') as v")).rows[0].v).toBe(false);  // globals now ignored for the role
    });
  }, 30_000);
});

describe.skipIf(!hasTestDb)('foundations · audit capture (before/after)', () => {
  it('records changed fields on a customer update', async () => {
    await withRollback(async (c) => {
      const t = await seedTenant(c, 'AUD');
      const cust = (await c.query("insert into erp_customers(company_id, code, name, branch_id) values($1,'C1','Old Name',$2) returning id", [t.company, t.branch])).rows[0].id;
      await actAs(c, t.admin);
      await c.query("update erp_customers set name='New Name' where id=$1", [cust]);
      // insert + update share now() within one tx, so select the update row explicitly
      const a = (await c.query("select action, change_set, old_value, new_value from erp_audit_logs where entity='customers' and entity_id=$1 and action='update' limit 1", [cust])).rows[0];
      expect(a, 'no update audit row').toBeTruthy();
      expect(a.action).toBe('update');
      expect(a.change_set).toContain('name');
      expect(a.old_value.name).toBe('Old Name');
      expect(a.new_value.name).toBe('New Name');
    });
  }, 30_000);
});

describe.skipIf(!hasTestDb)('foundations · notification engine', () => {
  it('enqueues a dispatch row when a template opts into email', async () => {
    await withRollback(async (c) => {
      const t = await seedTenant(c, 'NOT');
      await c.query("update erp_notification_templates set channels='{in_app,email}' where key='system'");
      await c.query("select erp_notify($1,$2,'system','t','t','b','/x','e','r')", [t.company, t.admin]);
      const inapp = await c.query("select 1 from erp_notifications where user_id=$1 and type='system'", [t.admin]);
      expect(inapp.rowCount).toBe(1);
      const disp = await c.query("select channel, status from erp_notification_dispatch where user_id=$1 and template_key='system'", [t.admin]);
      expect(disp.rows.map((r) => r.channel)).toContain('email');
      expect(disp.rows[0].status).toBe('queued');
    });
  }, 30_000);
});

describe.skipIf(!hasTestDb)('foundations · raw data framework + customer 360', () => {
  it('emits a fact (currency + branch-derived region) and composes the 360', async () => {
    await withRollback(async (c) => {
      const t = await seedTenant(c, 'RAW');
      const cust = (await c.query("insert into erp_customers(company_id, code, name, branch_id) values($1,'C9','Acme',$2) returning id", [t.company, t.branch])).rows[0].id;
      await actAs(c, t.admin);
      const fact = JSON.stringify({ customer_id: cust, branch_id: t.branch, amount: 100, currency: 'EGP', action_type: 'sale' });
      const fid = (await c.query("select erp_raw_emit('sales','sale',$1::jsonb) as id", [fact])).rows[0].id;
      const f = (await c.query("select currency, region, amount, customer_id from erp_raw_facts where id=$1", [fid])).rows[0];
      expect(f.currency).toBe('EGP');
      expect(f.region).toBe('North');       // derived from the branch
      expect(Number(f.amount)).toBe(100);

      const c360 = (await c.query("select erp_customer_360($1) as p", [cust])).rows[0].p;
      expect(c360.master.code).toBe('C9');
      expect(c360.master.region).toBe('North');
      expect(Array.isArray(c360.analytics)).toBe(true);
    });
  }, 30_000);
});

describe.skipIf(!hasTestDb)('foundations · RLS isolation', () => {
  it('raw facts are not visible across tenants', async () => {
    await withRollback(async (c) => {
      const a = await seedTenant(c, 'ISO_A');
      const b = await seedTenant(c, 'ISO_B');
      await actAs(c, a.admin);
      const fid = (await c.query("select erp_raw_emit('sales','sale','{}'::jsonb) as id")).rows[0].id;
      await resetRole(c);
      await actAs(c, b.admin);
      const seen = await c.query("select 1 from erp_raw_facts where id=$1", [fid]);
      expect(seen.rowCount).toBe(0);
    });
  }, 30_000);
});
