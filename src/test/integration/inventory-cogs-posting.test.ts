import { describe, it, expect } from 'vitest';
import type { Client } from 'pg';
import { hasTestDb, withRollback, connect } from '../db';
import { avgReceipt, avgIssue } from '@/lib/inventory/costing/engine';
import { resolveBalanced } from '@/lib/finance/posting/resolver';
import type { PostingRule, PostingRuleLine } from '@/lib/finance/posting/types';

/**
 * End-to-end Phase 1 posting path (Augment model, D-003), exercised against the
 * REAL schema: inventory costing ENGINE → real posting RESOLVER → the 0189 seeded
 * rules (loaded from the DB) → per-company account_map resolution → the atomic
 * erp_post_journal_entry RPC. Proves both missing legs post a balanced entry under
 * their distinct reference types (zero double-post with the legacy AR/Revenue
 * posting). Gated on TEST_DATABASE_URL. Nothing is persisted (rollback).
 */

async function seedCompanyBranch(c: Client): Promise<{ companyId: string; branchId: string }> {
  const { rows: [co] } = await c.query("insert into erp_companies(name) values ('ITEST_COGS') returning id");
  const { rows: [br] } = await c.query(
    "insert into erp_branches(company_id, code, name) values ($1, 'ICOGS', 'COGS ITest') returning id",
    [co.id],
  );
  return { companyId: co.id, branchId: br.id };
}

/** Map logical account keys → distinct COA codes for the company (account_map). */
async function mapAccounts(c: Client, companyId: string, keys: string[]): Promise<void> {
  const { rows } = await c.query(
    'select code from erp_chart_of_accounts order by code limit $1', [keys.length],
  );
  expect(rows.length).toBe(keys.length);
  for (let i = 0; i < keys.length; i++) {
    await c.query(
      'insert into erp_account_map(company_id, account_key, account_code) values ($1,$2,$3)',
      [companyId, keys[i], rows[i].code],
    );
  }
}

/** Load a seeded global rule (0189) from the DB into the resolver's TS shape. */
async function loadRule(c: Client, sourceEvent: string): Promise<PostingRule> {
  const { rows: [r] } = await c.query(
    'select id, company_id, source_event, name, priority, is_active from erp_posting_rules where source_event=$1 and company_id is null',
    [sourceEvent],
  );
  expect(r, `seeded rule for ${sourceEvent}`).toBeTruthy();
  const { rows: ls } = await c.query(
    'select side, account_key, amount_source, cost_center_source, sort_order from erp_posting_rule_lines where rule_id=$1 order by sort_order',
    [r.id],
  );
  const lines: PostingRuleLine[] = ls.map((l) => ({
    side: l.side, accountKey: l.account_key, amountSource: l.amount_source,
    costCenterSource: l.cost_center_source, sortOrder: l.sort_order,
  }));
  return {
    id: r.id, companyId: r.company_id, sourceEvent: r.source_event, name: r.name,
    priority: r.priority, isActive: r.is_active, lines,
  };
}

/** Resolve account keys → COA account ids for the company (account_map → COA). */
async function accountIds(c: Client, companyId: string, keys: string[]): Promise<Record<string, string>> {
  const { rows } = await c.query(
    `select m.account_key, a.id from erp_account_map m
       join erp_chart_of_accounts a on a.code = m.account_code
      where m.company_id = $1 and m.account_key = any($2)`,
    [companyId, keys],
  );
  const out: Record<string, string> = {};
  for (const r of rows) out[r.account_key] = r.id;
  return out;
}

describe.skipIf(!hasTestDb)('Phase 1 · inventory costing → GL posting (end-to-end)', () => {
  it('seeds two balanced global Augment rules (goods.received, invoice.cogs)', async () => {
    await withRollback(async (c) => {
      for (const ev of ['goods.received', 'invoice.cogs']) {
        const rule = await loadRule(c, ev);
        const debit = rule.lines.filter((l) => l.side === 'debit');
        const credit = rule.lines.filter((l) => l.side === 'credit');
        expect(debit).toHaveLength(1);
        expect(credit).toHaveLength(1);
        // both legs draw the same amount source → always balanced regardless of value
        expect(debit[0].amountSource).toBe(credit[0].amountSource);
      }
    });
  }, 30_000);

  it('sale → COGS → GL: Dr COGS / Cr Inventory posts balanced under invoice_cogs', async () => {
    await withRollback(async (c) => {
      const { companyId, branchId } = await seedCompanyBranch(c);
      await mapAccounts(c, companyId, ['cogs', 'inventory']);

      // costing ENGINE: receive 10@5 then 10@7 (avg 6), issue 5 → COGS 30
      let st = avgReceipt({ qty: 0, avgCost: 0 }, 10, 5);
      st = avgReceipt(st, 10, 7);
      const { cost } = avgIssue(st, 5);
      expect(cost).toBe(30);

      const rule = await loadRule(c, 'invoice.cogs');
      const lines = resolveBalanced(rule, { amounts: { cogs: cost } });
      const ids = await accountIds(c, companyId, lines.map((l) => l.accountKey));
      const payload = JSON.stringify(lines.map((l) => ({
        account_id: ids[l.accountKey], debit: l.debit, credit: l.credit,
      })));

      const { rows: [r] } = await c.query(
        "select erp_post_journal_entry($1, current_date, 'sale cogs', 'invoice_cogs', gen_random_uuid(), $2::jsonb) as entry",
        [branchId, payload],
      );
      expect(r.entry).toBeTruthy();

      const { rows: ls } = await c.query(
        'select debit, credit from erp_journal_lines where journal_entry_id=$1 order by debit desc', [r.entry],
      );
      expect(ls).toHaveLength(2);
      expect(Number(ls[0].debit)).toBe(30);   // Dr COGS
      expect(Number(ls[1].credit)).toBe(30);  // Cr Inventory
      const { rows: [e] } = await c.query(
        'select status, reference_type from erp_journal_entries where id=$1', [r.entry],
      );
      expect(e.status).toBe('posted');
      expect(e.reference_type).toBe('invoice_cogs');
    });
  }, 30_000);

  it('receipt → Inventory → GL: Dr Inventory / Cr GR-IR posts balanced under goods_receipt', async () => {
    await withRollback(async (c) => {
      const { companyId, branchId } = await seedCompanyBranch(c);
      await mapAccounts(c, companyId, ['inventory', 'gr_ir']);

      // costing ENGINE: a receipt of 10 @ 7 → inventory value 70
      const st = avgReceipt({ qty: 0, avgCost: 0 }, 10, 7);
      const value = st.qty * st.avgCost;
      expect(value).toBe(70);

      const rule = await loadRule(c, 'goods.received');
      const lines = resolveBalanced(rule, { amounts: { inventory: value } });
      const ids = await accountIds(c, companyId, lines.map((l) => l.accountKey));
      const payload = JSON.stringify(lines.map((l) => ({
        account_id: ids[l.accountKey], debit: l.debit, credit: l.credit,
      })));

      const { rows: [r] } = await c.query(
        "select erp_post_journal_entry($1, current_date, 'goods receipt', 'goods_receipt', gen_random_uuid(), $2::jsonb) as entry",
        [branchId, payload],
      );
      const { rows: ls } = await c.query(
        'select debit, credit from erp_journal_lines where journal_entry_id=$1 order by debit desc', [r.entry],
      );
      expect(ls).toHaveLength(2);
      expect(Number(ls[0].debit)).toBe(70);   // Dr Inventory
      expect(Number(ls[1].credit)).toBe(70);  // Cr GR-IR
      const { rows: [e] } = await c.query('select reference_type from erp_journal_entries where id=$1', [r.entry]);
      expect(e.reference_type).toBe('goods_receipt');
    });
  }, 30_000);
});
