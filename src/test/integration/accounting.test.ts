import { describe, it, expect } from 'vitest';
import type { Client } from 'pg';
import { hasTestDb, withRollback, connect } from '../db';

/**
 * Accounting integration tests — verify the revenue-posting helper produces a
 * correct, balanced double-entry, and that the live ledger never drifts out of
 * balance. Gated on TEST_DATABASE_URL (see src/test/db.ts).
 */

async function seedCompanyBranch(c: Client): Promise<{ companyId: string; branchId: string }> {
  const { rows: [co] } = await c.query("insert into erp_companies(name) values ('ITEST_ACC') returning id");
  const { rows: [br] } = await c.query(
    "insert into erp_branches(company_id, code, name) values ($1, 'ITST', 'Integration Branch') returning id",
    [co.id],
  );
  return { companyId: co.id, branchId: br.id };
}

interface LedgerLine { code: string; debit: string; credit: string }

async function linesFor(c: Client, entryId: string): Promise<LedgerLine[]> {
  const { rows } = await c.query(
    `select a.code, l.debit, l.credit
       from erp_journal_lines l
       join erp_chart_of_accounts a on a.id = l.account_id
      where l.journal_entry_id = $1
      order by l.debit desc`,
    [entryId],
  );
  return rows as LedgerLine[];
}

describe.skipIf(!hasTestDb)('accounting · erp_post_revenue', () => {
  it('posts a balanced cash → service-revenue entry', async () => {
    await withRollback(async (c) => {
      const { companyId, branchId } = await seedCompanyBranch(c);
      const { rows: [r] } = await c.query(
        "select erp_post_revenue($1,$2,$3,'cash','revenue_services','itest',null,'unit test') as entry",
        [companyId, branchId, 150],
      );
      expect(r.entry).toBeTruthy();

      const lines = await linesFor(c, r.entry);
      expect(lines).toHaveLength(2);

      const debit = lines.reduce((s, l) => s + Number(l.debit), 0);
      const credit = lines.reduce((s, l) => s + Number(l.credit), 0);
      expect(debit).toBe(150);
      expect(credit).toBe(150);
      expect(debit).toBe(credit); // double-entry must balance

      // Cash (1100) debited, Service Revenue (4200) credited.
      const cash = lines.find((l) => Number(l.debit) > 0)!;
      const rev = lines.find((l) => Number(l.credit) > 0)!;
      expect(cash.code).toBe('1100');
      expect(rev.code).toBe('4200');
    });
  }, 30_000);

  it('routes card payments to the bank account (1120)', async () => {
    await withRollback(async (c) => {
      const { companyId, branchId } = await seedCompanyBranch(c);
      const { rows: [r] } = await c.query(
        "select erp_post_revenue($1,$2,$3,'card','revenue_services','itest',null,'card test') as entry",
        [companyId, branchId, 80],
      );
      const lines = await linesFor(c, r.entry);
      const cash = lines.find((l) => Number(l.debit) > 0)!;
      expect(cash.code).toBe('1120');
    });
  }, 30_000);

  it('routes revenue_sales to sales revenue (4100)', async () => {
    await withRollback(async (c) => {
      const { companyId, branchId } = await seedCompanyBranch(c);
      const { rows: [r] } = await c.query(
        "select erp_post_revenue($1,$2,$3,'cash','revenue_sales','itest',null,'sales test') as entry",
        [companyId, branchId, 200],
      );
      const lines = await linesFor(c, r.entry);
      const rev = lines.find((l) => Number(l.credit) > 0)!;
      expect(rev.code).toBe('4100');
    });
  }, 30_000);

  it('ignores non-positive amounts (no entry posted)', async () => {
    await withRollback(async (c) => {
      const { companyId, branchId } = await seedCompanyBranch(c);
      const { rows: [r] } = await c.query(
        "select erp_post_revenue($1,$2,$3,'cash','revenue_services','itest',null,'zero') as entry",
        [companyId, branchId, 0],
      );
      expect(r.entry).toBeNull();
    });
  }, 30_000);
});

describe.skipIf(!hasTestDb)('accounting · ledger invariant', () => {
  it('every journal entry has balanced debits and credits', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(
        `select count(*)::int as unbalanced
           from (
             select journal_entry_id
               from erp_journal_lines
              group by journal_entry_id
             having round(sum(debit), 2) <> round(sum(credit), 2)
           ) x`,
      );
      expect(rows[0].unbalanced).toBe(0);
    } finally {
      await c.end().catch(() => {});
    }
  }, 30_000);
});
