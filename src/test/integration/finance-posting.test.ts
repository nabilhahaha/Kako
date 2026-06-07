import { describe, it, expect } from 'vitest';
import type { Client } from 'pg';
import { hasTestDb, withRollback, connect } from '../db';

/**
 * Finance posting-engine integration tests — verify the atomic posting RPC
 * (erp_post_journal_entry, 0187) writes a balanced, posted entry and REFUSES to
 * store an unbalanced or empty one (data-integrity, defense-in-depth beyond the
 * TS resolver). Gated on TEST_DATABASE_URL.
 */

async function seedCompanyBranch(c: Client): Promise<{ companyId: string; branchId: string }> {
  const { rows: [co] } = await c.query("insert into erp_companies(name) values ('ITEST_FIN') returning id");
  const { rows: [br] } = await c.query(
    "insert into erp_branches(company_id, code, name) values ($1, 'IFIN', 'Finance ITest') returning id",
    [co.id],
  );
  return { companyId: co.id, branchId: br.id };
}

/** Two account ids from the company's auto-seeded chart of accounts. */
async function twoAccounts(c: Client): Promise<{ a: string; b: string }> {
  const { rows } = await c.query("select id, code from erp_chart_of_accounts order by code limit 2");
  expect(rows.length).toBe(2);
  return { a: rows[0].id, b: rows[1].id };
}

describe.skipIf(!hasTestDb)('finance · erp_post_journal_entry', () => {
  it('posts a balanced 2-line entry', async () => {
    await withRollback(async (c) => {
      const { branchId } = await seedCompanyBranch(c);
      const { a, b } = await twoAccounts(c);
      const lines = JSON.stringify([
        { account_id: a, debit: 100, credit: 0 },
        { account_id: b, debit: 0, credit: 100 },
      ]);
      const { rows: [r] } = await c.query(
        "select erp_post_journal_entry($1, current_date, 'itest', 'itest_doc', gen_random_uuid(), $2::jsonb) as entry",
        [branchId, lines],
      );
      expect(r.entry).toBeTruthy();

      const { rows: ls } = await c.query(
        'select debit, credit from erp_journal_lines where journal_entry_id = $1', [r.entry],
      );
      expect(ls).toHaveLength(2);
      const debit = ls.reduce((s, l) => s + Number(l.debit), 0);
      const credit = ls.reduce((s, l) => s + Number(l.credit), 0);
      expect(debit).toBe(100);
      expect(credit).toBe(100);

      const { rows: [e] } = await c.query('select status from erp_journal_entries where id = $1', [r.entry]);
      expect(e.status).toBe('posted');
    });
  }, 30_000);

  it('REFUSES an unbalanced entry (no row written)', async () => {
    await withRollback(async (c) => {
      const { branchId } = await seedCompanyBranch(c);
      const { a, b } = await twoAccounts(c);
      const lines = JSON.stringify([
        { account_id: a, debit: 100, credit: 0 },
        { account_id: b, debit: 0, credit: 90 }, // unbalanced
      ]);
      await expect(
        c.query("select erp_post_journal_entry($1, current_date, 'itest', 'itest_doc', gen_random_uuid(), $2::jsonb)", [branchId, lines]),
      ).rejects.toThrow(/unbalanced/i);
    });
  }, 30_000);

  it('REFUSES an empty posting', async () => {
    await withRollback(async (c) => {
      const { branchId } = await seedCompanyBranch(c);
      await expect(
        c.query("select erp_post_journal_entry($1, current_date, 'itest', 'itest_doc', gen_random_uuid(), '[]'::jsonb)", [branchId]),
      ).rejects.toThrow(/no lines/i);
    });
  }, 30_000);
});
