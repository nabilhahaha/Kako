// ============================================================================
// Distribution — collection settlement gateway (impure DB boundary). Keeps the
// service unit-testable with a fake and the allocation engine pure. Supabase impl
// in supabase-gateway.ts (0192 tables + 0005 invoices).
// ============================================================================

import type { OutstandingInvoice, Allocation } from './allocation';

export interface CollectionHeaderInput {
  branchId: string;
  customerId: string;
  amount: number;
  method: string;
  collectionDate: string;
  referenceNumber?: string | null;
  receivedBy?: string | null;
}

export interface SettlementGateway {
  /** Open (unpaid / partially-paid) invoices for a customer, oldest-first orderable. */
  loadOutstandingInvoices(customerId: string): Promise<OutstandingInvoice[]>;
  /** Insert the collection header; returns its id. */
  createCollection(input: CollectionHeaderInput): Promise<string>;
  /** Persist the per-invoice allocation rows. */
  saveAllocations(collectionId: string, allocations: Allocation[]): Promise<void>;
  /** Apply an amount to an invoice (increment paid_amount; settle status when cleared). */
  applyToInvoice(invoiceId: string, applied: number): Promise<void>;
  /** Finalise the collection header totals + status. */
  updateCollectionTotals(collectionId: string, appliedAmount: number, unappliedAmount: number, status: string): Promise<void>;
}
