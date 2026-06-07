// ============================================================================
// Finance Foundation — Supabase implementation of the PostingGateway.
// Thin DB adapter: idempotency lookup, rule loading, account_key→account_id
// resolution (account_map → COA), and the atomic balanced insert via the
// erp_post_journal_entry RPC (0187). All under the caller's RLS. server-only.
// ============================================================================

import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { PostingGateway, JournalEntryInsert } from './gateway';
import type { PostingRule, PostingRuleLine, PostingSide } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = Awaited<ReturnType<typeof createClient>>;

export function createSupabasePostingGateway(db: Db): PostingGateway {
  return {
    async hasEntryFor(referenceType, referenceId) {
      const { data } = await db.from('erp_journal_entries')
        .select('id').eq('reference_type', referenceType).eq('reference_id', referenceId).limit(1).maybeSingle();
      return !!data;
    },

    async loadRules(sourceEvent) {
      const { data: rules } = await db.from('erp_posting_rules')
        .select('id, company_id, source_event, name, condition, priority, is_active')
        .eq('source_event', sourceEvent).eq('is_active', true);
      const ruleRows = (rules ?? []) as Array<Record<string, unknown>>;
      if (ruleRows.length === 0) return [];

      const ids = ruleRows.map((r) => r.id as string);
      const { data: lines } = await db.from('erp_posting_rule_lines')
        .select('rule_id, side, account_key, amount_source, cost_center_source, sort_order')
        .in('rule_id', ids);
      const linesByRule = new Map<string, PostingRuleLine[]>();
      for (const l of ((lines ?? []) as Array<Record<string, unknown>>)) {
        const arr = linesByRule.get(l.rule_id as string) ?? [];
        arr.push({
          side: l.side as PostingSide,
          accountKey: l.account_key as string,
          amountSource: l.amount_source as string,
          costCenterSource: (l.cost_center_source as string | null) ?? null,
          sortOrder: (l.sort_order as number) ?? 0,
        });
        linesByRule.set(l.rule_id as string, arr);
      }

      return ruleRows.map((r): PostingRule => ({
        id: r.id as string,
        companyId: (r.company_id as string | null) ?? null,
        sourceEvent: r.source_event as string,
        name: r.name as string,
        condition: (r.condition as Record<string, unknown>) ?? {},
        priority: (r.priority as number) ?? 100,
        isActive: r.is_active as boolean,
        lines: linesByRule.get(r.id as string) ?? [],
      }));
    },

    async resolveAccountIds(companyId, accountKeys) {
      if (accountKeys.length === 0) return {};
      const { data: maps } = await db.from('erp_account_map')
        .select('account_key, account_code').eq('company_id', companyId).in('account_key', accountKeys);
      const keyToCode = new Map<string, string>();
      for (const m of ((maps ?? []) as Array<{ account_key: string; account_code: string }>)) {
        keyToCode.set(m.account_key, m.account_code);
      }
      const codes = [...new Set([...keyToCode.values()])];
      if (codes.length === 0) return {};
      const { data: accounts } = await db.from('erp_chart_of_accounts')
        .select('id, code').in('code', codes);
      const codeToId = new Map<string, string>();
      for (const a of ((accounts ?? []) as Array<{ id: string; code: string }>)) codeToId.set(a.code, a.id);

      const out: Record<string, string> = {};
      for (const key of accountKeys) {
        const code = keyToCode.get(key);
        const id = code ? codeToId.get(code) : undefined;
        if (id) out[key] = id;
      }
      return out;
    },

    async insertPostedEntry(entry: JournalEntryInsert) {
      const { data, error } = await db.rpc('erp_post_journal_entry', {
        p_branch: entry.branchId,
        p_entry_date: entry.entryDate,
        p_description: entry.description,
        p_reference_type: entry.referenceType,
        p_reference_id: entry.referenceId,
        p_lines: entry.lines.map((l) => ({
          account_id: l.accountId, debit: l.debit, credit: l.credit,
          cost_center_id: l.costCenterId, description: l.description ?? null,
        })),
      });
      if (error) throw new Error(`erp_post_journal_entry: ${error.message}`);
      return data as string;
    },
  };
}
