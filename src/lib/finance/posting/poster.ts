// ============================================================================
// Finance Foundation — posting consumer/poster (Phase 1 increment 2).
// Orchestrates a single source event into a balanced GL entry, reusing the pure
// resolver + the posting gateway. Data-integrity invariants (each enforced and
// unit-tested): never posts when disabled; never DOUBLE-posts (idempotency);
// never posts an UNBALANCED entry (resolver throws); never posts a PARTIAL entry
// (aborts if any account_key is unresolved). Flag-gated by KAKO_FINANCE.
// ============================================================================

import { FINANCE_ENABLED } from '../flags';
import { resolveRule, resolveBalanced } from './resolver';
import type { PostingContext } from './types';
import type { PostingGateway, JournalLineInsert } from './gateway';

export interface PostFromEventInput {
  sourceEvent: string;
  referenceType: string;
  referenceId: string;
  companyId: string;
  branchId: string;
  entryDate: string;           // ISO date
  context: PostingContext;
  description?: string;
}

export type PostSkipReason =
  | 'disabled' | 'already_posted' | 'no_rule' | 'unresolved_accounts' | 'empty';

export type PostResult =
  | { posted: true; entryId: string }
  | { posted: false; reason: PostSkipReason; details?: string };

/** Resolve + post the GL entry for a source event. Pure orchestration over the
 *  gateway; safe to call unconditionally (no-op when KAKO_FINANCE is off). */
export async function postFromEvent(gw: PostingGateway, input: PostFromEventInput): Promise<PostResult> {
  if (!FINANCE_ENABLED()) return { posted: false, reason: 'disabled' };

  // Idempotency — never double-post a source document.
  if (await gw.hasEntryFor(input.referenceType, input.referenceId)) {
    return { posted: false, reason: 'already_posted' };
  }

  const rules = await gw.loadRules(input.sourceEvent);
  const rule = resolveRule(rules, input.sourceEvent, input.context);
  if (!rule) return { posted: false, reason: 'no_rule' };

  // resolveBalanced throws UnbalancedPostingError — never post an unbalanced entry.
  const lines = resolveBalanced(rule, input.context);
  if (lines.length === 0) return { posted: false, reason: 'empty' };

  const keys = [...new Set(lines.map((l) => l.accountKey))];
  const accountIds = await gw.resolveAccountIds(input.companyId, keys);
  const missing = keys.filter((k) => !accountIds[k]);
  if (missing.length > 0) {
    // Never post a partial entry — abort the whole posting if any account is unmapped.
    return { posted: false, reason: 'unresolved_accounts', details: missing.join(',') };
  }

  const journalLines: JournalLineInsert[] = lines.map((l) => ({
    accountId: accountIds[l.accountKey],
    debit: l.debit,
    credit: l.credit,
    costCenterId: l.costCenterId,
  }));

  const entryId = await gw.insertPostedEntry({
    branchId: input.branchId,
    entryDate: input.entryDate,
    description: input.description ?? rule.name,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    lines: journalLines,
  });

  return { posted: true, entryId };
}
