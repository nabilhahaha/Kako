// ============================================================================
// Finance Foundation — posting gateway (the impure DB boundary for the poster).
// Keeps the orchestration (poster.ts) unit-testable with a fake, and the pure
// resolver pure. The Supabase implementation lives in supabase-gateway.ts.
// ============================================================================

import type { PostingRule } from './types';

export interface JournalLineInsert {
  accountId: string;
  debit: number;
  credit: number;
  costCenterId: string | null;
  description?: string | null;
}

export interface JournalEntryInsert {
  branchId: string;
  entryDate: string;            // ISO date
  description: string;
  referenceType: string;
  referenceId: string;
  lines: JournalLineInsert[];
}

export interface PostingGateway {
  /** Idempotency: has the posting engine already written an entry for this source doc? */
  hasEntryFor(referenceType: string, referenceId: string): Promise<boolean>;
  /** Active posting rules (with lines) for an event, visible to the caller (RLS). */
  loadRules(sourceEvent: string): Promise<PostingRule[]>;
  /** Resolve account_key → account_id for the company (account_map → COA). Missing keys omitted. */
  resolveAccountIds(companyId: string, accountKeys: string[]): Promise<Record<string, string>>;
  /** Insert ONE balanced, posted entry + lines atomically (server re-checks balance). Returns entry id. */
  insertPostedEntry(entry: JournalEntryInsert): Promise<string>;
}
