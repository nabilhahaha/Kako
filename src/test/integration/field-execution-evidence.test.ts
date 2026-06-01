import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/** Field Execution (FE-5a) — evidence pipeline (DB side). */

describe.skipIf(!hasTestDb)('FE-5a · evidence: visit photo trigger + customer evidence', () => {
  it('auto-links a geofence photo, skips local markers, and rolls up customer evidence', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('FEEV') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id, code, name) values($1,'B','Main') returning id", [company])).rows[0].id;
      const admin = randomUUID(), rep = randomUUID();
      await c.query("insert into auth.users(id,email) values($1,$2),($3,$4)", [admin, 'a@feev.local', rep, 'r@feev.local']);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true)", [admin, branch]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'rep',true)", [rep, branch]);
      const cust = (await c.query("insert into erp_customers(company_id, code, name) values($1,'C1','Store') returning id", [company])).rows[0].id;

      // a visit with a real exception-photo path → trigger links it as evidence
      await actAs(c, rep);
      const v1 = (await c.query(
        "insert into erp_fe_visits(company_id, customer_id, rep_id, status, geofence_status, exception_photo) values($1,$2,$3,'in_progress','violation',$4) returning id",
        [company, cust, rep, `${company}/fe_visit/abc.jpg`],
      )).rows[0].id;
      // a visit whose photo is still a local marker → NOT linked
      const v2 = (await c.query(
        "insert into erp_fe_visits(company_id, customer_id, rep_id, status, geofence_status, exception_photo) values($1,$2,$3,'in_progress','violation',$4) returning id",
        [company, cust, rep, 'local:12345'],
      )).rows[0].id;
      await resetRole(c);

      expect((await c.query("select count(*)::int n from erp_entity_attachments where entity='fe_visit' and record_id=$1", [v1])).rows[0].n).toBe(1);
      expect((await c.query("select count(*)::int n from erp_entity_attachments where entity='fe_visit' and record_id=$1", [v2])).rows[0].n).toBe(0);

      // a capture with a linked photo attachment
      await actAs(c, admin);
      const form = (await c.query("select id from erp_form_definitions where key='fe_merchandising_audit' and company_id is null")).rows[0].id;
      const sub = (await c.query("insert into erp_form_submissions(company_id, form_id, record_id, submitter, status) values($1,$2,$3,$4,'approved') returning id", [company, form, cust, admin])).rows[0].id;
      const cap = (await c.query("insert into erp_fe_captures(company_id, customer_id, form_id, submission_id, kind, created_by) values($1,$2,$3,$4,'merchandising',$5) returning id", [company, cust, form, sub, admin])).rows[0].id;
      await c.query("insert into erp_entity_attachments(company_id, entity, record_id, file_name, file_path, mime_type) values($1,'fe_capture',$2,'shelf.jpg',$3,'image/jpeg')", [company, cap, `${company}/fe_capture/shelf.jpg`]);

      const ev = (await c.query("select erp_fe_customer_evidence($1) as j", [cust])).rows[0].j;
      expect(ev.length).toBe(2); // visit photo + capture photo
      const kinds = ev.map((e: { kind: string }) => e.kind).sort();
      expect(kinds).toEqual(['merchandising', 'visit']);
      await resetRole(c);
    });
  }, 30_000);
});
