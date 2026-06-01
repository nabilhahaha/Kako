import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/** Field Execution (FE-4a) — seeded capture templates + captures table/RLS. */

describe.skipIf(!hasTestDb)('FE-4a · seeded capture templates', () => {
  it('ships the six FMCG capture forms with emit_fact effects', async () => {
    await withRollback(async (c) => {
      const rows = (await c.query(
        "select key, effect->>'type' as eff, effect->>'event' as event, subject_ref->>'source' as subj from erp_form_definitions where company_id is null and key like 'fe_%' order by key",
      )).rows;
      const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
      for (const k of ['fe_merchandising_audit', 'fe_competitor_capture', 'fe_store_checklist', 'fe_out_of_stock', 'fe_opportunity', 'fe_complaint']) {
        expect(byKey[k]).toBeTruthy();
        expect(byKey[k].eff).toBe('emit_fact');
        expect(byKey[k].subj).toBe('record');
      }
      expect(byKey['fe_merchandising_audit'].event).toBe('fe_merchandising');
      expect(byKey['fe_out_of_stock'].event).toBe('fe_out_of_stock');

      // merchandising has the requested fields
      const fields = (await c.query(
        "select f.key from erp_form_fields f join erp_form_definitions d on d.id=f.form_id where d.key='fe_merchandising_audit' and d.company_id is null order by f.sort_order",
      )).rows.map((r) => r.key);
      expect(fields).toEqual(['display_type', 'display_count', 'share_of_shelf', 'planogram_compliance', 'shelf_price', 'photo']);
    });
  }, 30_000);
});

describe.skipIf(!hasTestDb)('FE-4b · capture access is per-type (Permission Matrix)', () => {
  it('a user granted only fe_competitor:execute sees/does competitor captures only', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('FEPT') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id, code, name) values($1,'B','Main') returning id", [company])).rows[0].id;
      const user = randomUUID();
      await c.query("insert into auth.users(id,email) values($1,$2)", [user, 'p@fept.local']);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'promoter',true)", [user, branch]);
      // company grants ONLY competitor capture to 'promoter'
      await c.query("insert into erp_matrix_role_permissions(company_id, role_key, permission) values($1,'promoter','fe_competitor:execute')", [company]);

      const cust = (await c.query("insert into erp_customers(company_id, code, name) values($1,'C1','Store') returning id", [company])).rows[0].id;
      const cForm = (await c.query("select id from erp_form_definitions where key='fe_competitor_capture' and company_id is null")).rows[0].id;
      const cSub = (await c.query("insert into erp_form_submissions(company_id, form_id, record_id, submitter, status) values($1,$2,$3,$4,'approved') returning id", [company, cForm, cust, user])).rows[0].id;

      await actAs(c, user);
      expect((await c.query("select erp_fe_capture_kinds() k")).rows[0].k).toEqual(['competitor']);
      expect((await c.query("select erp_fe_can_capture('competitor') h")).rows[0].h).toBe(true);
      expect((await c.query("select erp_fe_can_capture('merchandising') h")).rows[0].h).toBe(false);

      // competitor capture allowed
      const cap = (await c.query("insert into erp_fe_captures(company_id, customer_id, form_id, submission_id, kind, created_by) values($1,$2,$3,$4,'competitor',$5) returning id", [company, cust, cForm, cSub, user])).rows[0].id;
      expect(cap).toBeTruthy();
      // merchandising capture denied
      await c.query('savepoint sp');
      const denied = await c.query("insert into erp_fe_captures(company_id, customer_id, form_id, submission_id, kind, created_by) values($1,$2,$3,$4,'merchandising',$5)", [company, cust, cForm, cSub, user]).then(() => 'ok').catch(() => 'denied');
      expect(denied).toBe('denied');
      await c.query('rollback to savepoint sp');
      await resetRole(c);
    });
  }, 30_000);
});

describe.skipIf(!hasTestDb)('FE-4a/b · captures are permission-driven (field_ops:execute), not role-driven', () => {
  it('grants capture by permission; a user without it is denied regardless of role', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('FECAP') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id, code, name) values($1,'B','Main') returning id", [company])).rows[0].id;
      const rep = randomUUID(), other = randomUUID();
      await c.query("insert into auth.users(id,email) values($1,$2),($3,$4)", [rep, 'r@fecap.local', other, 'o@fecap.local']);
      // two arbitrary role titles; access is decided by the matrix grant, not the title
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'merchandiser',true)", [rep, branch]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'auditor',true)", [other, branch]);
      // company grants field_ops:execute to 'merchandiser' only (Permission Matrix)
      await c.query("insert into erp_matrix_role_permissions(company_id, role_key, permission) values($1,'merchandiser','field_ops:execute')", [company]);

      const cust = (await c.query("insert into erp_customers(company_id, code, name) values($1,'C1','Store') returning id", [company])).rows[0].id;
      const form = (await c.query("select id from erp_form_definitions where key='fe_merchandising_audit' and company_id is null")).rows[0].id;
      const sub = (await c.query("insert into erp_form_submissions(company_id, form_id, record_id, submitter, status) values($1,$2,$3,$4,'approved') returning id", [company, form, cust, rep])).rows[0].id;

      // merchandiser (granted) can record a capture
      await actAs(c, rep);
      expect((await c.query("select erp_matrix_has('field_ops','execute') h")).rows[0].h).toBe(true);
      const cap = (await c.query("insert into erp_fe_captures(company_id, customer_id, form_id, submission_id, kind, score, created_by) values($1,$2,$3,$4,'merchandising',8,$5) returning id", [company, cust, form, sub, rep])).rows[0].id;
      expect((await c.query("select count(*)::int n from erp_fe_captures where id=$1", [cap])).rows[0].n).toBe(1);
      await resetRole(c);

      // auditor (NOT granted) is denied writing a capture — purely permission-driven
      await actAs(c, other);
      expect((await c.query("select erp_matrix_has('field_ops','execute') h")).rows[0].h).toBe(false);
      await c.query('savepoint sp');
      const denied = await c.query("insert into erp_fe_captures(company_id, customer_id, form_id, submission_id, kind, created_by) values($1,$2,$3,$4,'merchandising',$5)", [company, cust, form, sub, other]).then(() => 'ok').catch(() => 'denied');
      expect(denied).toBe('denied');
      await c.query('rollback to savepoint sp');
      // and cannot see the merchandiser's capture (no field_ops:view)
      expect((await c.query("select count(*)::int n from erp_fe_captures where id=$1", [cap])).rows[0].n).toBe(0);
      await resetRole(c);
    });
  }, 30_000);
});
