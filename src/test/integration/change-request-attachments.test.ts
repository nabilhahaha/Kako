import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * Change Request engine — Phase 5: attachment document classification (0256).
 * The shared erp_attachments table gains a nullable doc_type; change-request
 * documents are tenant-isolated and tagged by doc_type. Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('change-requests · document attachments', () => {
  it('doc_type column exists and tags change-request documents under tenant RLS', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('CRD') returning id")).rows[0].id;
      const other = (await c.query("insert into erp_companies(name) values('CRD2') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ','HQ') returning id", [company])).rows[0].id;
      const user = randomUUID();
      await c.query('insert into auth.users(id, email) values ($1,$2)', [user, `u+${user}@test.local`]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,'admin',true)", [user, branch]);

      // A change request + a VAT-certificate document tagged by doc_type.
      await actAs(c, user);
      const cr = (await c.query(
        "insert into erp_change_requests(entity_key,scope,status,requested_by) values ('customer','single','submitted',$1) returning id",
        [user],
      )).rows[0].id;
      await c.query(
        `insert into erp_attachments(entity, record_id, bucket, path, file_name, mime_type, size_bytes, uploaded_by, doc_type)
         values ('change_request',$1,'attachments',$2,'vat.pdf','application/pdf',1234,$3,'vat_certificate')`,
        [cr, `${company}/change_request/${cr}/x.pdf`, user],
      );

      // Queryable by doc_type for this record.
      const rows = (await c.query(
        "select doc_type from erp_attachments where entity='change_request' and record_id=$1 and deleted_at is null",
        [cr],
      )).rows;
      expect(rows.length).toBe(1);
      expect(rows[0].doc_type).toBe('vat_certificate');
      await resetRole(c);

      // Cross-tenant isolation: a user of another company can't see the document.
      const otherBranch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'H2','H2') returning id", [other])).rows[0].id;
      const otherUser = randomUUID();
      await c.query('insert into auth.users(id, email) values ($1,$2)', [otherUser, `o+${otherUser}@test.local`]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,'admin',true)", [otherUser, otherBranch]);
      await actAs(c, otherUser);
      expect((await c.query("select count(*)::int n from erp_attachments where record_id=$1", [cr])).rows[0].n).toBe(0);
      await resetRole(c);
    });
  }, 30_000);

  it('the doc-type catalog is seeded and active', async () => {
    await withRollback(async (c) => {
      const rows = (await c.query(
        "select doc_key, is_active from erp_change_request_doc_types where company_id is null order by doc_key",
      )).rows;
      const keys = rows.map((r) => r.doc_key);
      expect(keys).toEqual(expect.arrayContaining(['approval_doc', 'contract', 'cr_copy', 'national_address', 'photo', 'vat_certificate']));
      expect(rows.every((r) => r.is_active === true)).toBe(true);
    });
  }, 30_000);
});
