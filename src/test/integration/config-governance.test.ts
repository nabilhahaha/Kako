import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * CG-1 — Configuration Governance.
 * Versioned governed changes (draft→review→approved→published→rolled_back),
 * audience targeting, pilot "view as" preview, SAFE publishing (drafts never
 * touch live), rollback, conflict validation, full audit trail. Feature flags
 * are the first concrete config type.
 */
const u = () => randomUUID().slice(0, 8);
async function rejects(c: Client, sql: string, params: unknown[], re: RegExp): Promise<void> {
  await c.query('savepoint sp'); await expect(c.query(sql, params)).rejects.toThrow(re); await c.query('rollback to savepoint sp');
}
async function seed(c: Client) {
  const company = (await c.query("insert into erp_companies(name) values('CG') returning id")).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id, code, name, region) values($1,$2,'Main','North') returning id", [company, `B${u()}`])).rows[0].id;
  const admin = randomUUID(), mgr = randomUUID(), repA = randomUUID(), repB = randomUUID();
  await c.query("insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6),($7,$8)", [admin, `a${u()}@x`, mgr, `m${u()}@x`, repA, `ra${u()}@x`, repB, `rb${u()}@x`]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true),($3,$2,'supervisor',true)", [admin, branch, mgr]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default,reports_to) values($1,$2,'salesman',true,$3),($4,$2,'salesman',true,$3)", [repA, branch, mgr, repB]);
  return { company, branch, admin, mgr, repA, repB };
}
const save = (ref: string, payload: object, audience: object, pilot: string[]) =>
  `select (erp_cfg_change_save('feature_flag','${ref}','${ref}','${JSON.stringify(payload)}'::jsonb,'${JSON.stringify(audience)}'::jsonb,'{${pilot.join(',')}}'::uuid[])->>'id') id`;

describe.skipIf(!hasTestDb)('CG-1 · configuration governance', () => {
  it('safe publish: drafts never affect live, pilots preview, then publish goes live; audit trail', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      await actAs(c, s.admin);
      const id = (await c.query(save('advanced_reports', { enabled: true }, { kind: 'all' }, [s.repA]))).rows[0].id;
      await resetRole(c);

      // SAFE: a live user sees nothing while it's a draft
      await actAs(c, s.repB);
      expect((await c.query("select erp_cfg_flag('advanced_reports') j")).rows[0].j.enabled).toBeNull();
      await resetRole(c);
      // a pilot user previews the draft (view-as), but their LIVE flag is still default
      await actAs(c, s.admin);
      const prev = (await c.query("select erp_cfg_flag_preview('advanced_reports',$1) j", [s.repA])).rows[0].j;
      expect(prev.enabled).toBe(true); expect(prev.source).toBe('pilot_draft');
      await resetRole(c);
      await actAs(c, s.repA);
      expect((await c.query("select erp_cfg_flag('advanced_reports') j")).rows[0].j.enabled).toBeNull(); // draft not live
      await resetRole(c);

      // workflow draft→review→approved→published
      await actAs(c, s.admin);
      await rejects(c, "select erp_cfg_set_state($1,'approved')", [id], /must be in review/);
      await c.query("select erp_cfg_set_state($1,'review')", [id]);
      await c.query("select erp_cfg_set_state($1,'approved')", [id]);
      expect((await c.query("select erp_cfg_publish($1) j", [id])).rows[0].j.ok).toBe(true);
      const row = (await c.query("select state, created_by, approved_by, published_by, published_at from erp_cfg_changes where id=$1", [id])).rows[0];
      expect(row.state).toBe('published'); expect(row.created_by).toBe(s.admin); expect(row.approved_by).toBe(s.admin);
      expect(row.published_by).toBe(s.admin); expect(row.published_at).not.toBeNull();
      await resetRole(c);
      // now live for everyone (audience all)
      await actAs(c, s.repB);
      const live = (await c.query("select erp_cfg_flag('advanced_reports') j")).rows[0].j;
      expect(live.enabled).toBe(true); expect(live.source).toBe('published');
      await resetRole(c);
    });
  }, 30_000);

  it('audience targeting limits who the published flag reaches', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      await actAs(c, s.admin);
      const id = (await c.query(save('promo_beta', { enabled: true }, { kind: 'role', ids: ['salesman'] }, []))).rows[0].id;
      await c.query("select erp_cfg_set_state($1,'review')", [id]);
      await c.query("select erp_cfg_set_state($1,'approved')", [id]);
      await c.query("select erp_cfg_publish($1)", [id]);
      await resetRole(c);
      await actAs(c, s.repA);   // salesman → in audience
      expect((await c.query("select erp_cfg_flag('promo_beta') j")).rows[0].j.enabled).toBe(true);
      await resetRole(c);
      await actAs(c, s.mgr);    // supervisor → not in audience
      expect((await c.query("select erp_cfg_flag('promo_beta') j")).rows[0].j.enabled).toBeNull();
      await resetRole(c);
    });
  }, 30_000);

  it('rollback reverts to the previous published version', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      await actAs(c, s.admin);
      const v1 = (await c.query(save('feature_x', { enabled: true }, { kind: 'all' }, []))).rows[0].id;
      await c.query("select erp_cfg_set_state($1,'review')", [v1]); await c.query("select erp_cfg_set_state($1,'approved')", [v1]); await c.query("select erp_cfg_publish($1)", [v1]);
      const v2 = (await c.query("select (erp_cfg_new_version($1)->>'id') id", [v1])).rows[0].id;
      await c.query("select erp_cfg_change_save('feature_flag','feature_x','feature_x',$1::jsonb,'{\"kind\":\"all\"}'::jsonb,'{}'::uuid[],$2)", [JSON.stringify({ enabled: false }), v2]);
      await c.query("select erp_cfg_set_state($1,'review')", [v2]); await c.query("select erp_cfg_set_state($1,'approved')", [v2]); await c.query("select erp_cfg_publish($1)", [v2]);
      await resetRole(c);
      await actAs(c, s.repA);
      expect((await c.query("select erp_cfg_flag('feature_x') j")).rows[0].j.enabled).toBe(false);  // v2 live
      await resetRole(c);
      await actAs(c, s.admin);
      const rb = (await c.query("select erp_cfg_rollback($1) j", [v2])).rows[0].j;
      expect(rb.reverted_to).toBe(v1);
      await resetRole(c);
      await actAs(c, s.repA);
      expect((await c.query("select erp_cfg_flag('feature_x') j")).rows[0].j.enabled).toBe(true);   // reverted to v1
      await resetRole(c);
    });
  }, 30_000);

  it('conflict validation blocks publish; non-admins cannot govern', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      // non-admin cannot author a change
      await actAs(c, s.mgr);
      await rejects(c, save('x', { enabled: true }, { kind: 'all' }, []), [], /forbidden/);
      await resetRole(c);
      // two in-flight changes for the same target → publishing the first is blocked
      await actAs(c, s.admin);
      const a = (await c.query(save('reports_v2', { enabled: true }, { kind: 'all' }, []))).rows[0].id;
      await c.query("select erp_cfg_set_state($1,'review')", [a]); await c.query("select erp_cfg_set_state($1,'approved')", [a]);
      const b = (await c.query(save('reports_v2', { enabled: false }, { kind: 'all' }, []))).rows[0].id;  // competing draft
      const issues = (await c.query("select erp_cfg_validate_change($1) j", [a])).rows[0].j as { code: string; level: string }[];
      expect(issues.find((i) => i.code === 'concurrent_change')?.level).toBe('error');
      const pub = (await c.query("select erp_cfg_publish($1) j", [a])).rows[0].j;
      expect(pub.ok).toBe(false);   // refused while a competing change is in flight
      // discard the competitor → publish now succeeds
      await c.query("update erp_cfg_changes set state='rolled_back' where id=$1", [b]);
      expect((await c.query("select erp_cfg_publish($1) j", [a])).rows[0].j.ok).toBe(true);
      await resetRole(c);
    });
  }, 30_000);
});
