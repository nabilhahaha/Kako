// ============================================================================
// Distribution — collection settlement service (Phase 3). Pure orchestration over
// the settlement gateway + the allocation engine: load a customer's outstanding
// invoices, allocate the collection (oldest-first or specified), persist the
// collection receipt + allocations, apply each amount to its invoice, and record
// the on-account remainder. No-op unless KAKO_DISTRIBUTION is on.
// ============================================================================

import { DISTRIBUTION_ENABLED } from '../flags';
import { allocatePayment } from './allocation';
import type { SettlementGateway } from './gateway';

export interface SettleCollectionInput {
  customerId: string;
  branchId: string;
  amount: number;
  method?: string;
  collectionDate?: string;
  referenceNumber?: string | null;
  receivedBy?: string | null;
  /** Optional explicit per-invoice amounts; otherwise oldest-first. */
  specified?: Record<string, number>;
}

export type SettleResult =
  | { settled: true; collectionId: string; totalApplied: number; unapplied: number; fullySettled: string[] }
  | { settled: false; reason: 'disabled' | 'invalid_amount' };

/** Settle a customer collection across outstanding invoices. */
export async function settleCollection(gw: SettlementGateway, input: SettleCollectionInput): Promise<SettleResult> {
  if (!DISTRIBUTION_ENABLED()) return { settled: false, reason: 'disabled' };
  if (!(input.amount > 0)) return { settled: false, reason: 'invalid_amount' };

  const invoices = await gw.loadOutstandingInvoices(input.customerId);
  const result = allocatePayment(input.amount, invoices, input.specified ? { specified: input.specified } : {});

  const collectionId = await gw.createCollection({
    branchId: input.branchId,
    customerId: input.customerId,
    amount: input.amount,
    method: input.method ?? 'cash',
    collectionDate: input.collectionDate ?? new Date().toISOString().slice(0, 10),
    referenceNumber: input.referenceNumber ?? null,
    receivedBy: input.receivedBy ?? null,
  });

  if (result.allocations.length > 0) {
    await gw.saveAllocations(collectionId, result.allocations);
    for (const a of result.allocations) {
      await gw.applyToInvoice(a.invoiceId, a.applied);
    }
  }

  await gw.updateCollectionTotals(collectionId, result.totalApplied, result.unapplied, 'settled');

  return {
    settled: true,
    collectionId,
    totalApplied: result.totalApplied,
    unapplied: result.unapplied,
    fullySettled: result.fullySettled,
  };
}
