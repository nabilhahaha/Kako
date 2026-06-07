// ============================================================================
// Purchasing — supplier-invoice GL orchestrator (Phase 2, Augment model). Posts
// the AP leg when a supplier invoice is approved: Dr GR-IR / Cr AP, under the
// distinct reference type 'supplier_invoice'. Reuses the Phase-1 poster + a seeded
// rule (0191). Net of the receipt leg (Dr Inventory / Cr GR-IR) this gives the
// correct Inventory Dr / AP Cr. Inert unless KAKO_FINANCE is on (poster self-gates).
// ============================================================================

import { postFromEvent, type PostResult } from '@/lib/finance/posting/poster';
import type { PostingGateway } from '@/lib/finance/posting/gateway';

export interface SupplierInvoiceGlInput {
  /** Bill total (the amount moving from GR-IR clearing to AP). */
  amount: number;
  companyId: string;
  branchId: string;
  /** The supplier-invoice id the GL entry references. */
  referenceId: string;
  entryDate: string;
  description?: string;
}

/** Post the AP leg for an approved supplier invoice. No-op when KAKO_FINANCE off;
 *  skips a zero/negative amount; idempotent on (reference_type, reference_id). */
export async function postSupplierInvoiceGl(gw: PostingGateway, input: SupplierInvoiceGlInput): Promise<PostResult> {
  if (!(input.amount > 0)) return { posted: false, reason: 'empty' };
  return postFromEvent(gw, {
    sourceEvent: 'supplier.invoice',
    referenceType: 'supplier_invoice',
    referenceId: input.referenceId,
    companyId: input.companyId,
    branchId: input.branchId,
    entryDate: input.entryDate,
    description: input.description,
    context: { amounts: { total: input.amount } },
  });
}
