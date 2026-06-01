import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * Field Execution (FE-2a) — visit lifecycle, GPS & geofence, offline-ready.
 * Drives the idempotent check-in/out RPCs as the rep, asserting: status
 * lifecycle, client-captured GPS/time preserved, geofence computation +
 * advisory enforcement (reason/photo), raw facts, manager alert, idempotency,
 * and the Customer 360 rollup. Rolled-back transaction.
 */

interface Tenant { company: string; branch: string; admin: string; manager: string; rep: string }

async function seed(c: Client, tag: string): Promise<Tenant> {
  const company = (await c.query("insert into erp_companies(name) values($1) returning id", [`FEV_${tag}`])).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id, code, name) values($1,$2,'Main') returning id", [company, `B${tag}`.slice(0, 8)])).rows[0].id;
  const admin = randomUUID(), manager = randomUUID(), rep = randomUUID();
  await c.query("insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6)", [admin, `a_${tag}@fev.local`, manager, `m_${tag}@fev.local`, rep, `r_${tag}@fev.local`]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true)", [admin, branch]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'manager',true)", [manager, branch]);
  // rep reports to the manager (drives the geofence alert target)
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default,reports_to) values($1,$2,'rep',true,$3)", [rep, branch, manager]);
  return { company, branch, admin, manager, rep };
}

/** Assert a query raises (matching regex) without poisoning the surrounding
 *  transaction — a raised error aborts the tx, so we wrap it in a savepoint. */
async function failsWith(c: Client, regex: RegExp, sql: string, params: unknown[]): Promise<void> {
  await c.query('savepoint sp');
  let threw = false;
  try { await c.query(sql, params); }
  catch (e) { threw = true; expect(String((e as Error).message)).toMatch(regex); await c.query('rollback to savepoint sp'); }
  if (!threw) throw new Error('expected the query to fail');
}

// A customer at a known location; radius default 150 m.
async function customerAt(c: Client, company: string, lat: number | null, lng: number | null): Promise<string> {
  return (await c.query(
    "insert into erp_customers(company_id, code, name, latitude, longitude) values($1,$2,'Store',$3,$4) returning id",
    [company, `C-${randomUUID().slice(0, 6)}`, lat, lng],
  )).rows[0].id;
}

const CAPTURED = '2026-06-01T08:00:00Z';

describe.skipIf(!hasTestDb)('FE-2a · in-geofence visit lifecycle', () => {
  it('start (ok) → end, preserving client GPS/time and emitting facts', async () => {
    await withRollback(async (c) => {
      const t = await seed(c, 'OK');
      const cust = await customerAt(c, t.company, 30.0, 31.0);
      const ref = randomUUID();
      await actAs(c, t.rep);
      const start = (await c.query(
        "select erp_fe_visit_start($1,$2,30.0000,31.0000,12,$3::timestamptz) as r", [ref, cust, CAPTURED],
      )).rows[0].r;
      expect(start.geofence_status).toBe('ok');
      expect(start.idempotent).toBe(false);

      const v = (await c.query("select status, checkin_at, checkin_lat, geofence_status from erp_fe_visits where id=$1", [start.id])).rows[0];
      expect(v.status).toBe('in_progress');
      expect(new Date(v.checkin_at).toISOString()).toBe('2026-06-01T08:00:00.000Z'); // client time, not now()
      expect(Number(v.checkin_lat)).toBeCloseTo(30.0, 4);

      const end = (await c.query("select erp_fe_visit_end($1,30.0,31.0,'2026-06-01T08:25:00Z') as r", [ref])).rows[0].r;
      expect(end.duration_min).toBe(25);
      expect((await c.query("select status from erp_fe_visits where id=$1", [start.id])).rows[0].status).toBe('completed');

      // raw facts emitted for both check-in and completion
      const facts = (await c.query("select event_type from erp_raw_facts where module='field_ops' and customer_id=$1 order by event_type", [cust])).rows.map((r) => r.event_type);
      expect(facts).toContain('fe_visit_checkin');
      expect(facts).toContain('fe_visit_completed');
      await resetRole(c);

      // Customer 360 rollup reflects the completed visit
      await actAs(c, t.admin);
      const r360 = (await c.query("select erp_customer_field_360($1) as j", [cust])).rows[0].j;
      expect(r360.visits_30d).toBe(1);
      expect(r360.last_geofence_status).toBe('ok');
      await resetRole(c);
    });
  }, 30_000);

  it('is idempotent: re-syncing the same client_ref returns the same visit', async () => {
    await withRollback(async (c) => {
      const t = await seed(c, 'IDEM');
      const cust = await customerAt(c, t.company, 30.0, 31.0);
      const ref = randomUUID();
      await actAs(c, t.rep);
      const a = (await c.query("select erp_fe_visit_start($1,$2,30,31,5,$3::timestamptz) as r", [ref, cust, CAPTURED])).rows[0].r;
      const b = (await c.query("select erp_fe_visit_start($1,$2,30,31,5,$3::timestamptz) as r", [ref, cust, CAPTURED])).rows[0].r;
      expect(b.idempotent).toBe(true);
      expect(b.id).toBe(a.id);
      expect((await c.query("select count(*)::int n from erp_fe_visits where client_ref=$1", [ref])).rows[0].n).toBe(1);
      await resetRole(c);
    });
  }, 30_000);
});

describe.skipIf(!hasTestDb)('FE-2b · replay consistency (no duplicate facts/audit on retry)', () => {
  it('re-syncing start+end leaves exactly one visit, one check-in fact, one completion fact', async () => {
    await withRollback(async (c) => {
      const t = await seed(c, 'RPL');
      const cust = await customerAt(c, t.company, 30.0, 31.0);
      const ref = randomUUID();
      await actAs(c, t.rep);
      // first sync
      await c.query("select erp_fe_visit_start($1,$2,30,31,5,$3::timestamptz) as r", [ref, cust, CAPTURED]);
      await c.query("select erp_fe_visit_end($1,30,31,'2026-06-01T08:20:00Z') as r", [ref]);
      // reconnect/retry: the SAME actions replay
      const s2 = (await c.query("select erp_fe_visit_start($1,$2,30,31,5,$3::timestamptz) as r", [ref, cust, CAPTURED])).rows[0].r;
      const e2 = (await c.query("select erp_fe_visit_end($1,30,31,'2026-06-01T08:20:00Z') as r", [ref])).rows[0].r;
      expect(s2.idempotent).toBe(true);
      expect(e2.idempotent).toBe(true);
      await resetRole(c);

      expect((await c.query("select count(*)::int n from erp_fe_visits where client_ref=$1", [ref])).rows[0].n).toBe(1);
      expect((await c.query("select count(*)::int n from erp_raw_facts where module='field_ops' and event_type='fe_visit_checkin' and customer_id=$1", [cust])).rows[0].n).toBe(1);
      expect((await c.query("select count(*)::int n from erp_raw_facts where module='field_ops' and event_type='fe_visit_completed' and customer_id=$1", [cust])).rows[0].n).toBe(1);
      expect((await c.query("select count(*)::int n from erp_audit_logs where entity='fe_visit' and action='checkin' and entity_id=$1", [s2.id])).rows[0].n).toBe(1);
    });
  }, 30_000);
});

describe.skipIf(!hasTestDb)('FE-2a · out-of-geofence (advisory) handling', () => {
  it('records distance, requires a reason, and alerts the manager', async () => {
    await withRollback(async (c) => {
      const t = await seed(c, 'OOF');
      await c.query("insert into erp_fe_settings(company_id) values($1)", [t.company]); // advisory, radius 150, photo>500
      const cust = await customerAt(c, t.company, 30.0, 31.0);
      const ref = randomUUID();
      await actAs(c, t.rep);

      // ~310 m away (0.002° lat) → violation; no reason → rejected
      await failsWith(c, /reason required/, "select erp_fe_visit_start($1,$2,30.0020,31.0000,8,$3::timestamptz) as r", [ref, cust, CAPTURED]);

      // with a reason (and within photo threshold) → accepted, status violation
      const ok = (await c.query("select erp_fe_visit_start($1,$2,30.0020,31.0000,8,$3::timestamptz,null,'Customer moved stall') as r", [ref, cust, CAPTURED])).rows[0].r;
      expect(ok.geofence_status).toBe('violation');
      expect(Number(ok.distance_m)).toBeGreaterThan(150);
      await resetRole(c);

      // manager (reports_to) was alerted
      const n = (await c.query("select 1 from erp_notifications where user_id=$1 and type='fe_geofence_violation'", [t.manager])).rows;
      expect(n.length).toBeGreaterThanOrEqual(1);
    });
  }, 30_000);

  it('requires an exception photo beyond the photo threshold', async () => {
    await withRollback(async (c) => {
      const t = await seed(c, 'PHOTO');
      await c.query("insert into erp_fe_settings(company_id, geofence_photo_threshold_m) values($1, 200)", [t.company]);
      const cust = await customerAt(c, t.company, 30.0, 31.0);
      const ref = randomUUID();
      await actAs(c, t.rep);
      // ~310 m away, beyond 200 m photo threshold, reason but no photo → rejected
      await failsWith(c, /photo required/, "select erp_fe_visit_start($1,$2,30.0020,31.0000,8,$3::timestamptz,null,'reason') as r", [ref, cust, CAPTURED]);
      // with a photo → accepted
      const ok = (await c.query("select erp_fe_visit_start($1,$2,30.0020,31.0000,8,$3::timestamptz,null,'reason','photo.jpg') as r", [ref, cust, CAPTURED])).rows[0].r;
      expect(ok.geofence_status).toBe('violation');
      await resetRole(c);
    });
  }, 30_000);
});

describe.skipIf(!hasTestDb)('FE-2a · unknown geofence when customer has no coordinates', () => {
  it('does not block when the customer location is unset', async () => {
    await withRollback(async (c) => {
      const t = await seed(c, 'UNK');
      const cust = await customerAt(c, t.company, null, null);
      await actAs(c, t.rep);
      const r = (await c.query("select erp_fe_visit_start($1,$2,30,31,5,$3::timestamptz) as r", [randomUUID(), cust, CAPTURED])).rows[0].r;
      expect(r.geofence_status).toBe('unknown');
      await resetRole(c);
    });
  }, 30_000);
});
