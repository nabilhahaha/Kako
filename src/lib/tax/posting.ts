// ============================================================================
// Global Tax — GL posting orchestrator (Phase 5A · M5, Augment model). Bridges the
// VAT engine's computed tax to the EXISTING Phase-1 poster, under distinct tax
// reference types (zero overlap with sales/AR/COGS/AP):
//   * output     → 'tax.output'     → Dr AR / Cr Output VAT     (ref 'tax_output')
//   * input      → 'tax.input'      → Dr Input VAT / Cr AP      (ref 'tax_input')
//   * adjustment → 'tax.adjustment' → Dr Output VAT / Cr AR     (ref 'tax_adjustment')
// Reuse-over-rebuild: pure orchestration over the PostingGateway + poster. Inert
// unless KAKO_FINANCE is on (poster self-gates); idempotent on (reference_type, id).
// ============================================================================

import { postFromEvent, type PostResult } from '@/lib/finance/posting/poster';
import type { PostingGateway } from '@/lib/finance/posting/gateway';

export type TaxGlKind = 'output' | 'input' | 'adjustment';

export interface TaxGlInput {
  kind: TaxGlKind;
  amount: number;          // the tax amount (context.amounts.total)
  companyId: string;
  branchId: string;
  referenceId: string;     // the source document id
  entryDate: string;
  description?: string;
}

const SPEC: Record<TaxGlKind, { sourceEvent: string; referenceType: string }> = {
  output: { sourceEvent: 'tax.output', referenceType: 'tax_output' },
  input: { sourceEvent: 'tax.input', referenceType: 'tax_input' },
  adjustment: { sourceEvent: 'tax.adjustment', referenceType: 'tax_adjustment' },
};

/** Post the VAT leg for a document. No-op when KAKO_FINANCE off; skips a
 *  non-positive amount; idempotent on (reference_type, reference_id). */
export async function postTaxGl(gw: PostingGateway, input: TaxGlInput): Promise<PostResult> {
  if (!(input.amount > 0)) return { posted: false, reason: 'empty' };
  const spec = SPEC[input.kind];
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
