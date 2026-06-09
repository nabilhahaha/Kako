import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hasTestDb, withRollback } from '../db';

/**
 * Critical Alerts Framework — Phase A3 sources (0261). Validates the global rules
 * are seeded and that the ready sources' underlying queries hit real columns
 * (credit_limit over erp_customers; pending/overdue over erp_workflow_tasks).
 * The pure plan/dispatch logic is unit-tested; this guards the SQL surface.
 * Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('alerts · sources', () => {
  it('seeds global rules for the ready sources', async () => {
    await withRollback(async (c) => {
      const rows = (await c.query(
        "select rule_key, source_key, is_active from erp_alert_rules where company_id is null order by rule_key",
      )).rows;
      const keys = rows.map((r) => r.rule_key);
      expect(keys).toEqual(expect.arrayContaining(['credit_limit', 'overdue_requests', 'pending_approvals']));
      expect(rows.every((r) => r.is_active === true)).toBe(true);
    });
  }, 30_000);

  it('credit_limit source query matches over-limit customers (column check)', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('ALS') returning id")).rows[0].id;
      const over = (await c.query("insert into erp_customers(company_id,code,name,credit_limit,balance) values ($1,$2,'Over',1000,1500) returning id", [company, `O-${randomUUID().slice(0, 6)}`])).rows[0].id;
      await c.query("insert into erp_customers(company_id,code,name,credit_limit,balance) values ($1,$2,'Ok',1000,200)", [company, `K-${randomUUID().slice(0, 6)}`]);
      // mirrors the source: credit_limit>0 then balance>credit_limit
      const hit = (await c.query(
        "select id from erp_customers where company_id=$1 and credit_limit>0 and balance>credit_limit",
        [company],
      )).rows;
      expect(hit.length).toBe(1);
      expect(hit[0].id).toBe(over);
    });
  }, 30_000);

  it('overdue/pending source queries match real workflow_tasks columns', async () => {
    await withRollback(async (c) => {
      // column-existence guard (no rows needed): the query must be valid SQL
      const r = await c.query(
        "select id, instance_id, due_at, created_at from erp_workflow_tasks where company_id=$1 and status='pending' limit 1",
        [randomUUID()],
      );
      expect(Array.isArray(r.rows)).toBe(true);
    });
  }, 30_000);
});
