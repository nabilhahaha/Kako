import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * FE-5e-2 — detection rules + configurable thresholds.
 * One scoped orchestrator (admin-only) raises coverage / compliance / OOS /
 * opportunity / customer-risk alerts, each with a computed owner (the rep's
 * supervisor), severity and due date. Persisting conditions REFRESH the open
 * alert (cooldown + aging seen_count) instead of duplicating. Thresholds are
 * configurable per company with no code change.
 */

async function oCap(c: Client, company: string, cust: string, rep: string, kind: string, values: object, visit: string | null): Promise<void> {
  const key = kind === 'out_of_stock' ? 'fe_out_of_stock' : 'fe_opportunity';
  const form = (await c.query('select id from erp_form_definitions where company_id is null and key=$1', [key])).rows[0].id;
  const sub = (await c.query("insert into erp_form_submissions(company_id, form_id, record_id, submitter, values, status) values($1,$2,$3,$4,$5::jsonb,'approved') returning id", [company, form, cust, rep, JSON.stringify(values)])).rows[0].id;
  await c.query('insert into erp_fe_captures(company_id, visit_id, customer_id, form_id, submission_id, kind, created_by) values($1,$2,$3,$4,$5,$6,$7)', [company, visit, cust, form, sub, kind, rep]);
}

async function seed(c: Client) {
  const company = (await c.query("insert into erp_companies(name) values('FEAR') returning id")).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id, code, name, area) values($1,'B','Main','A1') returning id", [company])).rows[0].id;
  const admin = randomUUID(), mgr = randomUUID(), rep = randomUUID();
  await c.query("insert into auth.users(id,email) values($1,'ad@x'),($2,'mg@x'),($3,'rp@x')", [admin, mgr, rep]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true),($3,$2,'supervisor',true)", [admin, branch, mgr]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default,reports_to) values($1,$2,'rep',true,$3)", [rep, branch, mgr]);
  const route = (await c.query("insert into erp_routes(company_id, name, rep_id) values($1,'R1',$2) returning id", [company, rep])).rows[0].id;
  const custs: string[] = [];
  for (let i = 0; i < 10; i++) custs.push((await c.query("insert into erp_customers(company_id, code, name, branch_id, route_id, salesman_id) values($1,$2,$3,$4,$5,$6) returning id", [company, `C${i}`, `C${i}`, branch, route, rep])).rows[0].id);
  // a published plan yesterday: 10 due stops, 2 visited → coverage 20%
  const plan = (await c.query("insert into erp_fe_route_plans(company_id, route_id, rep_id, plan_date, status, published_at) values($1,$2,$3, current_date - 1,'published',now()) returning id", [company, route, rep])).rows[0].id;
  for (let i = 0; i < 10; i++) await c.query("insert into erp_fe_route_stops(company_id, plan_id, customer_id, seq, status) values($1,$2,$3,$4,$5)", [company, plan, custs[i], i, i < 2 ? 'visited' : 'planned']);
  return { company, branch, admin, mgr, rep, route, custs };
}

describe.skipIf(!hasTestDb)('FE-5e-2 · detection rules', () => {
  it('raises coverage/compliance/oos/opportunity alerts with owner + severity', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      // compliance: 3 geofence violations (2 at the same customer)
      for (const cu of [s.custs[0], s.custs[0], s.custs[1]])
        await c.query("insert into erp_fe_visits(company_id, customer_id, rep_id, route_id, status, geofence_status, checkin_at) values($1,$2,$3,$4,'completed','violation', now())", [s.company, cu, s.rep, s.route]);
      // oos: 3 items at C3 (2 share a SKU)
      await oCap(c, s.company, s.custs[3], s.rep, 'out_of_stock', { product: 'SKU1', severity: 'high', est_lost_sales: '200' }, null);
      await oCap(c, s.company, s.custs[3], s.rep, 'out_of_stock', { product: 'SKU1', severity: 'medium' }, null);
      await oCap(c, s.company, s.custs[3], s.rep, 'out_of_stock', { product: 'SKU2', severity: 'low' }, null);
      // opportunity: one high-value (critical), one ordinary new (info)
      await oCap(c, s.company, s.custs[4], s.rep, 'opportunity', { est_value: '2500' }, null);
      await oCap(c, s.company, s.custs[5], s.rep, 'opportunity', { est_value: '100' }, null);

      await actAs(c, s.admin);
      const res = (await c.query('select erp_fe_run_alert_rules() j')).rows[0].j;
      expect(res.coverage).toBe(3);       // route + rep + area below target
      expect(res.compliance).toBe(2);     // geofence excess + repeat-at-customer
      expect(res.oos).toBe(2);            // high customer + repeat SKU
      expect(res.opportunity).toBe(2);    // high-value + new

      // coverage rep alert: critical (20% ≪ 80−15), owned by the supervisor
      const repAlert = (await c.query("select * from erp_fe_alerts where rule_key='coverage_rep_below' and rep_id=$1", [s.rep])).rows[0];
      expect(repAlert.severity).toBe('critical');
      expect(Number(repAlert.metric)).toBe(20);
      expect(repAlert.owner_id).toBe(s.mgr);
      expect(repAlert.owner_level).toBe('supervisor');
      expect(repAlert.due_date).not.toBeNull();
      // high-value opportunity is critical; the ordinary one is info
      expect((await c.query("select severity from erp_fe_alerts where rule_key='opp_high_value'")).rows[0].severity).toBe('critical');
      expect((await c.query("select severity from erp_fe_alerts where rule_key='opp_new'")).rows[0].severity).toBe('info');
      // OOS repeat-SKU alert carries the sku
      expect((await c.query("select sku from erp_fe_alerts where rule_key='oos_repeat_sku'")).rows[0].sku).toBe('SKU1');
      await resetRole(c);
    });
  }, 30_000);

  it('is idempotent on re-run (cooldown) and tracks aging (seen_count)', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      await actAs(c, s.admin);
      const r1 = (await c.query('select erp_fe_run_alert_rules() j')).rows[0].j;
      const n1 = (await c.query('select count(*)::int n from erp_fe_alerts')).rows[0].n;
      const r2 = (await c.query('select erp_fe_run_alert_rules() j')).rows[0].j;
      const n2 = (await c.query('select count(*)::int n from erp_fe_alerts')).rows[0].n;
      expect(r2.coverage).toBe(r1.coverage);
      expect(n2).toBe(n1);                 // no duplicates created
      const a = (await c.query("select seen_count, first_seen_at, last_seen_at from erp_fe_alerts where rule_key='coverage_rep_below' limit 1")).rows[0];
      expect(a.seen_count).toBe(2);        // refreshed, aging tracked
      expect(new Date(a.last_seen_at).getTime()).toBeGreaterThanOrEqual(new Date(a.first_seen_at).getTime());
      await resetRole(c);
    });
  }, 30_000);

  it('thresholds are configurable per company (no code change)', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      await actAs(c, s.admin);
      // lower the coverage target below the actual 20% → no coverage alert
      await c.query("insert into erp_fe_alert_thresholds(company_id, key, value) values($1,'coverage_target_pct',15)", [s.company]);
      expect(Number((await c.query("select erp_fe_threshold('coverage_target_pct',$1) v", [s.company])).rows[0].v)).toBe(15);
      const res = (await c.query('select erp_fe_run_alert_rules() j')).rows[0].j;
      expect(res.coverage).toBe(0);        // 20% now meets the (lowered) target
      await resetRole(c);
    });
  }, 30_000);

  it('the orchestrator is admin/owner only (company-wide write)', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      await actAs(c, s.mgr);               // a supervisor cannot run company-wide detection
      await c.query('savepoint sp');
      await expect(c.query('select erp_fe_run_alert_rules()')).rejects.toThrow(/forbidden/);
      await c.query('rollback to savepoint sp');
      await resetRole(c);
    });
  }, 30_000);
});
