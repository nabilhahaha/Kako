import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * ERP Attachments (0111) — tenant isolation + soft-delete filtering.
 * Proves company A cannot see company B's attachments, and that soft-deleted
 * rows drop out of the active list. (File bytes / storage RLS are exercised
 * manually; this covers the metadata table's RLS.) Gated on TEST_DATABASE_URL.
 */

async function mkUser(c: Client): Promise<string> {
  const id = randomUUID();
  await c.query('insert into auth.users(id, email) values ($1,$2)', [id, `u+${id}@test.local`]);
  return id;
}

async function seedCompany(c: Client, name: string): Promise<{ company: string; user: string }> {
  const company = (await c.query('insert into erp_companies(name) values ($1) returning id', [name])).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ','HQ') returning id", [company])).rows[0].id;
  const user = await mkUser(c);
  await c.query('insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,$3,true)', [user, branch, 'admin']);
  return { company, user };
}

async function addAttachment(c: Client, company: string, recordId: string): Promise<string> {
  const r = await c.query(
    `insert into erp_attachments(company_id, entity, record_id, bucket, path, file_name)
     values ($1,'customer',$2,'attachments',$3,'doc.pdf') returning id`,
    [company, recordId, `${company}/customer/${recordId}/${randomUUID()}.pdf`],
  );
  return r.rows[0].id;
}

const activeIds = async (c: Client, ids: string[]) =>
  (await c.query('select id from erp_attachments where id = any($1::uuid[]) and deleted_at is null', [ids])).rows.map((x) => x.id).sort();

describe.skipIf(!hasTestDb)('attachments · RLS + soft delete', () => {
  it('tenant isolation + soft-deleted rows hidden', async () => {
    await withRollback(async (c) => {
      const A = await seedCompany(c, 'ATT_A');
      const B = await seedCompany(c, 'ATT_B');
      const recA = randomUUID();
      const recB = randomUUID();
      const attA = await addAttachment(c, A.company, recA);
      const attB = await addAttachment(c, B.company, recB);
      const all = [attA, attB];

      // A sees only A's; B sees only B's.
      await actAs(c, A.user);
      expect(await activeIds(c, all)).toEqual([attA]);
      await resetRole(c);
      await actAs(c, B.user);
      expect(await activeIds(c, all)).toEqual([attB]);
      await resetRole(c);

      // Soft-delete A's attachment → drops out of the active list.
      await c.query('update erp_attachments set deleted_at = now(), deleted_by = $2 where id = $1', [attA, A.user]);
      await actAs(c, A.user);
      expect(await activeIds(c, all)).toEqual([]);
      await resetRole(c);
    });
  }, 30_000);
});
