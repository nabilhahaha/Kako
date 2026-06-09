import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * Change Request engine — Phase 4: the generic apply/execution layer
 * (erp_change_request_apply + erp_change_request_run_due, migration 0255).
 * Entity-agnostic, allowlist-guarded, before/after audited, idempotent,
 * partial-failure tolerant. Gated on TEST_DATABASE_URL.
 */

/** Seed a tenant + a customer with a starting credit_limit, owned by `company`. */
async function seedTenantCustomer(c: Client, credit: number) {
  const company = (await c.query("insert into erp_companies(name) values('CRA') returning id")).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ','HQ') returning id", [company])).rows[0].id;
  const user = randomUUID();
  await c.query('insert into auth.users(id, email) values ($1,$2)', [user, `u+${user}@test.local`]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,'admin',true)", [user, branch]);
  const sfx = randomUUID().slice(0, 6);
  const customer = (await c.query(
    "insert into erp_customers(company_id,code,name,credit_limit) values ($1,$2,'A',$3) returning id",
    [company, `A-${sfx}`, credit],
  )).rows[0].id;
  return { company, user, customer };
}

/** Create an approved single-record change request for `customer` setting a field. */
async function seedApprovedRequest(c: Client, user: string, customer: string, field: string, newValue: string, effectiveAt: string | null = null) {
  await actAs(c, user);
  const cr = (await c.query(
    "insert into erp_change_requests(entity_key,scope,status,requested_by,effective_at) values ('customer','single','approved',$1,$2) returning id",
    [user, effectiveAt],
  )).rows[0].id;
  await c.query('insert into erp_change_request_targets(request_id,target_id) values ($1,$2)', [cr, customer]);
  await c.query(
    `insert into erp_change_request_values(request_id,target_id,field_key,new_value) values ($1,$2,$3,$4::jsonb)`,
    [cr, customer, field, newValue],
  );
  await resetRole(c);
  return cr;
}

describe.skipIf(!hasTestDb)('change-requests · apply engine', () => {
  it('applies an approved request to the customer with before/after audit', async () => {
    await withRollback(async (c) => {
      const { user, customer } = await seedTenantCustomer(c, 100);
      const cr = await seedApprovedRequest(c, user, customer, 'credit_limit', '500');

      const final = (await c.query('select erp_change_request_apply($1) as s', [cr])).rows[0].s;
      expect(final).toBe('applied');

      expect(Number((await c.query('select credit_limit from erp_customers where id=$1', [customer])).rows[0].credit_limit)).toBe(500);
      expect((await c.query('select status, applied_at is not null applied from erp_change_requests where id=$1', [cr])).rows[0])
        .toMatchObject({ status: 'applied', applied: true });
      expect((await c.query('select status from erp_change_request_targets where request_id=$1', [cr])).rows[0].status).toBe('applied');
      // before captured on the value row + in the audit trail
      expect(Number((await c.query('select old_value from erp_change_request_values where request_id=$1', [cr])).rows[0].old_value)).toBe(100);
      const audit = (await c.query("select details from erp_audit_logs where action='change_request.apply' and entity_id=$1", [cr])).rows[0];
      expect(audit.details.before.credit_limit).toBe(100);
      expect(audit.details.after.credit_limit).toBe(500);
    });
  }, 30_000);

  it('is idempotent and gates non-ready requests', async () => {
    await withRollback(async (c) => {
      const { user, customer } = await seedTenantCustomer(c, 100);
      const cr = await seedApprovedRequest(c, user, customer, 'credit_limit', '500');
      expect((await c.query('select erp_change_request_apply($1) as s', [cr])).rows[0].s).toBe('applied');
      // second apply is a no-op (status no longer ready) → still 500, no double work
      expect((await c.query('select erp_change_request_apply($1) as s', [cr])).rows[0].s).toBe('applied');
      expect(Number((await c.query('select credit_limit from erp_customers where id=$1', [customer])).rows[0].credit_limit)).toBe(500);

      // a 'submitted' request is not applied
      await actAs(c, user);
      const draft = (await c.query("insert into erp_change_requests(entity_key,scope,status,requested_by) values ('customer','single','submitted',$1) returning id", [user])).rows[0].id;
      await resetRole(c);
      expect((await c.query('select erp_change_request_apply($1) as s', [draft])).rows[0].s).toBe('submitted');
    });
  }, 30_000);

  it('parks a future-dated request as scheduled (not applied yet)', async () => {
    await withRollback(async (c) => {
      const { user, customer } = await seedTenantCustomer(c, 100);
      const cr = await seedApprovedRequest(c, user, customer, 'credit_limit', '900');
      await c.query("update erp_change_requests set effective_at = now() + interval '7 days' where id=$1", [cr]);
      expect((await c.query('select erp_change_request_apply($1) as s', [cr])).rows[0].s).toBe('scheduled');
      expect(Number((await c.query('select credit_limit from erp_customers where id=$1', [customer])).rows[0].credit_limit)).toBe(100);
      expect((await c.query('select status from erp_change_requests where id=$1', [cr])).rows[0].status).toBe('scheduled');
    });
  }, 30_000);

  it('run_due applies every ready request', async () => {
    await withRollback(async (c) => {
      const { user, customer } = await seedTenantCustomer(c, 100);
      const cr = await seedApprovedRequest(c, user, customer, 'credit_limit', '750');
      const n = (await c.query('select erp_change_request_run_due() as n')).rows[0].n;
      expect(Number(n)).toBeGreaterThanOrEqual(1);
      expect(Number((await c.query('select credit_limit from erp_customers where id=$1', [customer])).rows[0].credit_limit)).toBe(750);
      expect((await c.query('select status from erp_change_requests where id=$1', [cr])).rows[0].status).toBe('applied');
    });
  }, 30_000);
});
