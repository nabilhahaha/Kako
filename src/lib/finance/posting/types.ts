// ============================================================================
// Finance Foundation — posting-rule engine types (Phase 1, approved arch #131 §6).
// A posting rule maps a source event (+ optional condition) to debit/credit line
// templates; the pure resolver turns a rule + a source-document context into
// balanced draft journal lines (account_key + amounts). Account-key → account_id
// resolution (via erp_account_map/COA) and the actual journal write are separate,
// impure steps handled by the poster in a later increment.
// ============================================================================

export type PostingSide = 'debit' | 'credit';

export interface PostingRuleLine {
  side: PostingSide;
  /** Logical account key, resolved per-company via erp_account_map → COA. */
  accountKey: string;
  /** Key into context.amounts (e.g. 'net', 'tax', 'total', 'cogs'). */
  amountSource: string;
  /** Optional key into context.costCenters for this line's cost center. */
  costCenterSource?: string | null;
  sortOrder?: number;
}

export interface PostingRule {
  id: string;
  companyId: string | null;          // null = industry-neutral default
  sourceEvent: string;               // e.g. 'invoice.issued'
  name: string;
  condition?: Record<string, unknown>; // equality predicate vs context.attributes
  priority: number;                  // lower evaluated first
  isActive: boolean;
  lines: PostingRuleLine[];
}

export interface PostingContext {
  /** Named monetary amounts from the source document. */
  amounts: Record<string, number>;
  /** Optional named cost-center ids the rule lines may reference. */
  costCenters?: Record<string, string | null>;
  /** Attributes the rule `condition` is matched against. */
  attributes?: Record<string, unknown>;
}

/** A resolved draft line: account still by key (id resolution happens in the poster). */
export interface ResolvedLine {
  accountKey: string;
  debit: number;
  credit: number;
  costCenterId: string | null;
}
