import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * Builder validation — real FMCG business processes driven end-to-end using
 * CONFIGURATION ONLY (Dynamic Form & Workflow Builder):
 *   1. New Customer Request   → create_customer, company_admin approval
 *   2. Customer Data Update    → update_field,    account_owner (record subject)
 *   3. GPS Correction Request  → set_gps,         route_owner  (record subject)
 *   4. Field-sourced subject   → account_owner resolved from a FORM FIELD
 *      (proves the declarative subject_ref generalises to Trade Spend / Old
 *       Expiry / Credit and any future customer-related form — no hard-coding)
 *
 * Each test exercises the config-sensitive path in SQL: submission → workflow
 * start → subject/owner resolution (generic subject_ref) → notification →
 * decide → completion-hook payload (entity/record_id, the exact inputs the app
 * hands applyFormEffect), then performs the configured effect AS THE RESOLVED
 * APPROVER to prove the write is RLS-allowed and produces the intended change.
 * The effect executor itself is unit-proven in form-effects.test.ts.
 *
 * Runs against a real Postgres via TEST_DATABASE_URL; otherwise skipped. All
 * writes happen inside a rolled-back transaction.
 */

interface Tenant { company: string; branch: string; admin: string }

async function seedTenant(c: Client, tag: string): Promise<Tenant> {
  const company = (await c.query("insert into erp_companies(name) values($1) returning id", [`FMCG_${tag}`])).rows[0].id;
  const branch = (await c.query(
    "insert into erp_branches(company_id, code, name) values($1,$2,'Main') returning id",
    [company, `B${tag}`.slice(0, 8)],
  )).rows[0].id;
  const admin = randomUUID();
  await c.query("insert into auth.users(id, email) values($1,$2)", [admin, `admin_${tag}@fmcg.local`]);
  await c.query("insert into erp_user_branches(user_id, branch_id, role, is_default) values($1,$2,'admin',true)", [admin, branch]);
  return { company, branch, admin };
}

async function addMember(c: Client, branch: string, tag: string, role = 'rep'): Promise<string> {
  const uid = randomUUID();
  await c.query("insert into auth.users(id, email) values($1,$2)", [uid, `${tag}_${uid.slice(0, 8)}@fmcg.local`]);
  await c.query("insert into erp_user_branches(user_id, branch_id, role, is_default) values($1,$2,$3,true)", [uid, branch, role]);
  return uid;
}

/** Create a company form bound to a (seeded global) form_submission workflow. */
async function makeForm(c: Client, company: string, key: string, workflowKey: string, effect: object, subjectRef: object | null = null): Promise<string> {
  return (await c.query(
    `insert into erp_form_definitions(company_id, key, name_en, workflow_key, effect, subject_ref, status)
     values($1,$2,$2,$3,$4::jsonb,$5::jsonb,'active') returning id`,
    [company, key, workflowKey, JSON.stringify(effect), subjectRef ? JSON.stringify(subjectRef) : null],
  )).rows[0].id;
}

async function newCustomer(c: Client, company: string, over: Record<string, unknown> = {}): Promise<string> {
  const cols = { code: `C-${randomUUID().slice(0, 8)}`, name: 'Acme', ...over };
  const keys = ['company_id', ...Object.keys(cols)];
  const vals = [company, ...Object.values(cols)];
  const ph = keys.map((_, i) => `$${i + 1}`).join(',');
  return (await c.query(`insert into erp_customers(${keys.join(',')}) values(${ph}) returning id`, vals)).rows[0].id;
}

async function submit(c: Client, company: string, form: string, recordId: string | null, submitter: string, values: object): Promise<string> {
  return (await c.query(
    `insert into erp_form_submissions(company_id, form_id, record_id, submitter, values, status)
     values($1,$2,$3,$4,$5::jsonb,'pending') returning id`,
    [company, form, recordId, submitter, JSON.stringify(values)],
  )).rows[0].id;
}

describe.skipIf(!hasTestDb)('FMCG Builder validation · the three seeded templates exist', () => {
  it('ships New Customer / Customer Update / GPS Correction as global templates', async () => {
    await withRollback(async (c) => {
      const tpl = await c.query(
        "select key, effect->>'type' as eff, subject_ref->>'source' as subj from erp_form_definitions where company_id is null and key like 'fmcg_%' order by key",
      );
      expect(tpl.rows).toHaveLength(3);
      const byKey = Object.fromEntries(tpl.rows.map((r) => [r.key, r]));
      expect(byKey['fmcg_new_customer'].eff).toBe('create_customer');
      expect(byKey['fmcg_customer_update'].eff).toBe('update_field');
      expect(byKey['fmcg_customer_update'].subj).toBe('record');
      expect(byKey['fmcg_gps_correction'].eff).toBe('set_gps');
      // ordered by key: customer_update, gps_correction, new_customer
      const steps = await c.query(
        `select wd.key, ws.approver_type from erp_workflow_definitions wd
           join erp_workflow_steps ws on ws.definition_id = wd.id
          where wd.company_id is null and wd.entity='form_submission' and wd.key like 'fmcg_%' order by wd.key`,
      );
      expect(steps.rows.map((r) => r.approver_type)).toEqual(['account_owner', 'route_owner', 'company_admin']);
    });
  }, 30_000);
});

describe.skipIf(!hasTestDb)('FMCG · 1) New Customer Request (create_customer, company_admin)', () => {
  it('submits → admin approves → customer is created', async () => {
    await withRollback(async (c) => {
      const t = await seedTenant(c, 'NC');
      const form = await makeForm(c, t.company, 'p1_new_customer', 'fmcg_new_customer_wf', {
        type: 'create_customer', map: { name: 'customer_name', phone: 'phone' },
      });
      const values = { customer_name: 'Nile Foods', phone: '0100' };

      await actAs(c, t.admin);
      const sub = await submit(c, t.company, form, null, t.admin, values);
      const inst = (await c.query("select erp_workflow_start('fmcg_new_customer_wf','form_submission',$1,$2::jsonb) as id", [sub, JSON.stringify(values)])).rows[0].id;
      expect(inst).toBeTruthy();
      await resetRole(c);

      const task = (await c.query("select id, assignee_type from erp_workflow_tasks where instance_id=$1", [inst])).rows[0];
      expect(task.assignee_type).toBe('company_admin');
      const notif = await c.query("select 1 from erp_notifications where user_id=$1 and type='workflow_task_assigned' and record_id=$2", [t.admin, sub]);
      expect(notif.rowCount).toBeGreaterThanOrEqual(1);

      await actAs(c, t.admin);
      const r = (await c.query("select erp_workflow_decide($1,'approve',null) as r", [task.id])).rows[0].r;
      expect(r).toMatchObject({ final: true, status: 'approved', entity: 'form_submission', record_id: sub });

      // effect (as the approving admin, mirroring applyFormEffect.create_customer)
      const cust = (await c.query(
        `insert into erp_customers(company_id, code, name, phone, is_approved)
         values($1,$2,$3,$4,false) returning name, phone`,
        [t.company, `FRM-${Date.now().toString(36)}`, values.customer_name, values.phone],
      )).rows[0];
      expect(cust).toMatchObject({ name: 'Nile Foods', phone: '0100' });
      await resetRole(c);
    });
  }, 30_000);
});

describe.skipIf(!hasTestDb)('FMCG · 2) Customer Data Update (update_field, account_owner · record subject)', () => {
  it('routes to the customer’s salesman → approves → phone updated', async () => {
    await withRollback(async (c) => {
      const t = await seedTenant(c, 'CU');
      const rep = await addMember(c, t.branch, 'rep', 'rep');
      const cust = await newCustomer(c, t.company, { name: 'Delta Mart', phone: 'OLD', salesman_id: rep });
      const form = await makeForm(c, t.company, 'p2_update', 'fmcg_customer_update_wf',
        { type: 'update_field', table: 'erp_customers', column: 'phone', value_from: 'new_phone' },
        { entity: 'customer', source: 'record' });

      await actAs(c, t.admin);
      const sub = await submit(c, t.company, form, cust, t.admin, { new_phone: 'NEW-555' });
      const inst = (await c.query("select erp_workflow_start('fmcg_customer_update_wf','form_submission',$1,'{}'::jsonb) as id", [sub])).rows[0].id;
      await resetRole(c);

      const task = (await c.query("select id, assignee_type, assignee_ref from erp_workflow_tasks where instance_id=$1", [inst])).rows[0];
      expect(task.assignee_type).toBe('user');
      expect(task.assignee_ref).toBe(rep);
      const notif = await c.query("select 1 from erp_notifications where user_id=$1 and type='workflow_task_assigned'", [rep]);
      expect(notif.rowCount).toBeGreaterThanOrEqual(1);

      await actAs(c, rep);
      const r = (await c.query("select erp_workflow_decide($1,'approve',null) as r", [task.id])).rows[0].r;
      expect(r).toMatchObject({ final: true, status: 'approved', entity: 'form_submission', record_id: sub });
      await c.query("update erp_customers set phone='NEW-555' where id=$1 and company_id=$2", [cust, t.company]);
      await resetRole(c);

      expect((await c.query("select phone from erp_customers where id=$1", [cust])).rows[0].phone).toBe('NEW-555');
    });
  }, 30_000);
});

describe.skipIf(!hasTestDb)('FMCG · 3) GPS Correction Request (set_gps, route_owner · record subject)', () => {
  it('routes to the route rep → approves → lat/lng written', async () => {
    await withRollback(async (c) => {
      const t = await seedTenant(c, 'GPS');
      const driver = await addMember(c, t.branch, 'driver', 'rep');
      await c.query("insert into erp_company_modules(company_id, module, enabled) values($1,'distribution',true)", [t.company]);
      const route = (await c.query("insert into erp_routes(company_id, name, rep_id) values($1,'R1',$2) returning id", [t.company, driver])).rows[0].id;
      const cust = await newCustomer(c, t.company, { name: 'Coast Store', route_id: route });
      const form = await makeForm(c, t.company, 'p3_gps', 'fmcg_gps_correction_wf',
        { type: 'set_gps', table: 'erp_customers', value_from: 'location' },
        { entity: 'customer', source: 'record' });

      await actAs(c, t.admin);
      const sub = await submit(c, t.company, form, cust, t.admin, { location: '30.0444,31.2357' });
      const inst = (await c.query("select erp_workflow_start('fmcg_gps_correction_wf','form_submission',$1,'{}'::jsonb) as id", [sub])).rows[0].id;
      await resetRole(c);

      const task = (await c.query("select assignee_type, assignee_ref from erp_workflow_tasks where instance_id=$1", [inst])).rows[0];
      expect(task.assignee_type).toBe('user');
      expect(task.assignee_ref).toBe(driver);

      await actAs(c, driver);
      const r = (await c.query("select erp_workflow_decide((select id from erp_workflow_tasks where instance_id=$1),'approve',null) as r", [inst])).rows[0].r;
      expect(r).toMatchObject({ final: true, status: 'approved', entity: 'form_submission', record_id: sub });
      await c.query("update erp_customers set latitude=30.0444, longitude=31.2357 where id=$1 and company_id=$2", [cust, t.company]);
      await resetRole(c);

      const after = (await c.query("select latitude, longitude from erp_customers where id=$1", [cust])).rows[0];
      expect(Number(after.latitude)).toBeCloseTo(30.0444, 4);
      expect(Number(after.longitude)).toBeCloseTo(31.2357, 4);
    });
  }, 30_000);
});

describe.skipIf(!hasTestDb)('Builder pre-pack · submitter outcome notification', () => {
  it('erp_notify_send resolves the form_approved template for the submitter', async () => {
    await withRollback(async (c) => {
      const t = await seedTenant(c, 'NT');
      const form = await makeForm(c, t.company, 'p_notify', 'fmcg_new_customer_wf', { type: 'record_only' });
      await actAs(c, t.admin);
      const sub = await submit(c, t.company, form, null, t.admin, {});
      // mirrors the form_submission handler's submitter notification
      await c.query("select erp_notify_send($1,$2,'form_approved','{}'::jsonb,'/forms','form_submission',$3)", [t.company, t.admin, sub]);
      await resetRole(c);
      const n = (await c.query("select title_en, type from erp_notifications where user_id=$1 and record_id=$2", [t.admin, sub])).rows[0];
      expect(n.type).toBe('form_approved');
      expect(n.title_en).toBe('Your request was approved');
    });
  }, 30_000);
});

describe.skipIf(!hasTestDb)('Builder pre-pack · entity_ref field type', () => {
  it('accepts an entity_ref field with config and a field-sourced subject end-to-end', async () => {
    await withRollback(async (c) => {
      const t = await seedTenant(c, 'ER');
      const rep = await addMember(c, t.branch, 'rep', 'rep');
      const cust = await newCustomer(c, t.company, { name: 'Picked Co', salesman_id: rep });
      const form = await makeForm(c, t.company, 'p_entity_ref', 'fmcg_customer_update_wf',
        { type: 'update_field', table: 'erp_customers', column: 'phone', value_from: 'new_phone' },
        { entity: 'customer', source: 'field', key: 'customer_id' });
      // entity_ref picker field storing a customer id (with per-field config)
      await c.query(
        `insert into erp_form_fields(form_id, key, label_en, type, sort_order, required, config)
         values($1,'customer_id','Customer','entity_ref',1,true,'{"entity":"customer"}'::jsonb)`,
        [form],
      );
      await actAs(c, t.admin);
      const sub = await submit(c, t.company, form, null, t.admin, { customer_id: cust, new_phone: 'ER-9' });
      const inst = (await c.query("select erp_workflow_start('fmcg_customer_update_wf','form_submission',$1,'{}'::jsonb) as id", [sub])).rows[0].id;
      await resetRole(c);
      const task = (await c.query("select assignee_ref from erp_workflow_tasks where instance_id=$1", [inst])).rows[0];
      expect(task.assignee_ref).toBe(rep); // owner resolved from the entity_ref field value
    });
  }, 30_000);
});

describe.skipIf(!hasTestDb)('FMCG · 4) Field-sourced subject (account_owner resolved from a form field)', () => {
  it('resolves the owner from values.customer_id — the generic, reusable path', async () => {
    await withRollback(async (c) => {
      const t = await seedTenant(c, 'FLD');
      const rep = await addMember(c, t.branch, 'rep', 'rep');
      const cust = await newCustomer(c, t.company, { name: 'Field Pick', salesman_id: rep });
      // A form where the customer is chosen as a field (like Trade Spend / Credit).
      const form = await makeForm(c, t.company, 'p4_field_subject', 'fmcg_customer_update_wf',
        { type: 'update_field', table: 'erp_customers', column: 'phone', value_from: 'new_phone' },
        { entity: 'customer', source: 'field', key: 'customer_id' });

      await actAs(c, t.admin);
      // record_id is null; the subject customer lives in values.customer_id
      const sub = await submit(c, t.company, form, null, t.admin, { customer_id: cust, new_phone: 'FX-1' });
      const inst = (await c.query("select erp_workflow_start('fmcg_customer_update_wf','form_submission',$1,$2::jsonb) as id", [sub, JSON.stringify({ customer_id: cust })])).rows[0].id;
      await resetRole(c);

      // owner resolved from the FIELD value, not record_id
      const task = (await c.query("select assignee_type, assignee_ref from erp_workflow_tasks where instance_id=$1", [inst])).rows[0];
      expect(task.assignee_type).toBe('user');
      expect(task.assignee_ref).toBe(rep);
      expect((await c.query("select erp_workflow_subject_customer('form_submission',$1) as cid", [sub])).rows[0].cid).toBe(cust);
    });
  }, 30_000);
});
