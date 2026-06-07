// ============================================================================
// Trade Spend — GL orchestrators (Phase 4, Augment model). Bridge accrual + claim
// settlement to the EXISTING Phase-1 poster, under distinct reference types
// (zero overlap with sales/AR/COGS):
//   * accrual → 'trade.accrual' → Dr promo expense / Cr accrued trade-spend  (ref 'trade_accrual')
//   * claim   → 'trade.claim'   → Dr accrued trade-spend / Cr AR             (ref 'trade_claim')
// Reuse-over-rebuild: pure orchestration over the PostingGateway + poster. Inert
// unless KAKO_FINANCE is on (poster self-gates); idempotent on (reference_type, id).
// ============================================================================

import { postFromEvent, type PostResult } from '@/lib/finance/posting/poster';
import type { PostingGateway } from '@/lib/finance/posting/gateway';

export interface TradeGlInput {
  amount: number;
  companyId: string;
  branchId: string;
  referenceId: string;   // the accrual id / claim id
  entryDate: string;
  description?: string;
}

const SPEC = {
  accrual: { sourceEvent: 'trade.accrual', referenceType: 'trade_accrual' },
  claim:   { sourceEvent: 'trade.claim',   referenceType: 'trade_claim' },
} as const;

async function post(gw: PostingGateway, kind: keyof typeof SPEC, input: TradeGlInput): Promise<PostResult> {
  if (!(input.amount > 0)) return { posted: false, reason: 'empty' };
  const spec = SPEC[kind];
  return postFromEvent(gw, {
    sourceEvent: spec.sourceEvent,
    referenceType: spec.referenceType,
    referenceId: input.referenceId,
    companyId: input.companyId,
    branchId: input.branchId,
    entryDate: input.entryDate,
    description: input.description,
    context: { amounts: { total: input.amount } },
  });
}

/** Post a trade-spend accrual: Dr promo expense / Cr accrued trade-spend. */
export const postTradeAccrualGl = (gw: PostingGateway, input: TradeGlInput) => post(gw, 'accrual', input);

/** Post a settled trade-spend claim/deduction: Dr accrued trade-spend / Cr AR. */
export const postTradeClaimGl = (gw: PostingGateway, input: TradeGlInput) => post(gw, 'claim', input);
