import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * Field Execution (FE-1) foundations — under the field_ops capability module.
 * Verifies the per-company settings + RLS, the field_ops permission grants, the
 * notification templates, and the Customer 360 companion rollup fed purely by
 * raw facts (the emit_fact effect's destination). Rolled-back transaction.
 */

interface Tenant { company: string; branch: string; admin: string }

async function seedTenant(c: Client, tag: string): Promise<Tenant> {
  const company = (await c.query("insert into erp_companies(name) values($1) returning id", [`FE_${tag}`])).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id, code, name) values($1,$2,'Main') returning id", [company, `B${tag}`.slice(0, 8)])).rows[0].id;
  const admin = randomUUID();
  await c.query("insert into auth.users(id, email) values($1,$2)", [admin, `admin_${tag}@fe.local`]);
  await c.query("insert into erp_user_branches(user_id, branch_id, role, is_default) values($1,$2,'admin',true)", [admin, branch]);
  return { company, branch, admin };
}

describe.skipIf(!hasTestDb)('FE-1 · settings + RLS', () => {
  it('company admin can configure geofence/coverage; defaults are sane', async () => {
    await withRollback(async (c) => {
      const t = await seedTenant(c, 'SET');
      await actAs(c, t.admin);
      await c.query("insert into erp_fe_settings(company_id) values($1)", [t.company]);
      const s = (await c.query("select geofence_radius_m, geofence_mode, coverage_target_pct from erp_fe_settings where company_id=$1", [t.company])).rows[0];
      expect(s.geofence_mode).toBe('advisory');
      expect(s.geofence_radius_m).toBe(150);
      expect(s.coverage_target_pct).toBe(80);
      await c.query("update erp_fe_settings set geofence_mode='blocking', geofence_radius_m=250 where company_id=$1", [t.company]);
      expect((await c.query("select geofence_mode from erp_fe_settings where company_id=$1", [t.company])).rows[0].geofence_mode).toBe('blocking');
      await resetRole(c);
    });
  }, 30_000);
});

describe.skipIf(!hasTestDb)('FE-1 · field_ops permissions + templates', () => {
  it('seeds the field_ops resource, admin grants and notification templates', async () => {
    await withRollback(async (c) => {
      const perms = (await c.query("select action from erp_permission_catalog where resource='field_ops' order by action")).rows.map((r) => r.action);
      expect(perms).toEqual(['approve', 'dashboard', 'execute', 'plan', 'view']);
      const adminGrants = (await c.query("select count(*)::int n from erp_matrix_role_permissions where company_id is null and role_key='admin' and permission like 'field_ops:%'")).rows[0].n;
      expect(adminGrants).toBe(5);
      const tpl = (await c.query("select count(*)::int n from erp_notification_templates where key in ('fe_route_published','fe_visit_missed','fe_geofence_violation','fe_coverage_low','fe_competitor_alert')")).rows[0].n;
      expect(tpl).toBe(5);
    });
  }, 30_000);
});

describe.skipIf(!hasTestDb)('FE-1 · Customer 360 field rollup (raw-facts driven)', () => {
  it('reflects emitted field_ops facts (the emit_fact destination)', async () => {
    await withRollback(async (c) => {
      const t = await seedTenant(c, '360');
      const cust = (await c.query("insert into erp_customers(company_id, code, name) values($1,$2,'Store') returning id", [t.company, `C-${randomUUID().slice(0, 6)}`])).rows[0].id;
      await actAs(c, t.admin);
      // emit a completed visit + a competitor price (what emit_fact / FE-2 will push)
      await c.query("select erp_raw_emit('field_ops','fe_visit_completed',$1::jsonb)", [JSON.stringify({ company_id: t.company, customer_id: cust })]);
      await c.query("select erp_raw_emit('field_ops','fe_visit_checkin',$1::jsonb)", [JSON.stringify({ company_id: t.company, customer_id: cust, geofence_result: 'ok' })]);
      await c.query("select erp_raw_emit('field_ops','fe_competitor',$1::jsonb)", [JSON.stringify({ company_id: t.company, customer_id: cust, amount: '19.9', currency: 'EGP' })]);
      const r = (await c.query("select erp_customer_field_360($1) as j", [cust])).rows[0].j;
      expect(r.visits_30d).toBe(1);
      expect(r.last_geofence_status).toBe('ok');
      expect(Number(r.last_competitor_price)).toBeCloseTo(19.9, 1);
      expect(r.last_visit_at).not.toBeNull();
      await resetRole(c);
    });
  }, 30_000);
});
