// ============================================================================
// Distribution — Supabase implementation of the SettlementGateway (0192 tables +
// 0005 erp_invoices). Thin DB adapter under the caller's RLS (branch-scoped).
// server-only.
// ============================================================================

import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { SettlementGateway, CollectionHeaderInput } from './gateway';
import type { OutstandingInvoice, Allocation } from './allocation';

type Db = Awaited<ReturnType<typeof createClient>>;

export function createSupabaseSettlementGateway(db: Db): SettlementGateway {
  return {
    async loadOutstandingInvoices(customerId) {
      const { data } = await db.from('erp_invoices')
        .select('id, net_amount, paid_amount, due_date, created_at')
        .eq('customer_id', customerId)
        .in('status', ['issued', 'partially_paid', 'overdue']);
      return ((data ?? []) as Array<Record<string, unknown>>)
        .map((r): OutstandingInvoice => ({
          id: r.id as string,
          outstanding: Number(r.net_amount ?? 0) - Number(r.paid_amount ?? 0),
          date: (r.due_date as string | null) ?? (r.created_at as string),
        }))
        .filter((i) => i.outstanding > 0);
    },

    async createCollection(input: CollectionHeaderInput) {
      const { data, error } = await db.from('erp_collections').insert({
        branch_id: input.branchId, customer_id: input.customerId, amount: input.amount,
        method: input.method, collection_date: input.collectionDate,
        reference_number: input.referenceNumber, received_by: input.receivedBy,
      }).select('id').single();
      if (error) throw error;
      return (data as { id: string }).id;
    },

    async saveAllocations(collectionId, allocations: Allocation[]) {
      if (allocations.length === 0) return;
      await db.from('erp_collection_allocations').insert(
        allocations.map((a) => ({ collection_id: collectionId, invoice_id: a.invoiceId, applied_amount: a.applied })),
      );
    },

    async applyToInvoice(invoiceId, applied) {
      // Read-modify-write the paid_amount; settle status when fully covered.
      const { data } = await db.from('erp_invoices')
        .select('net_amount, paid_amount').eq('id', invoiceId).maybeSingle();
      if (!data) return;
      const row = data as { net_amount: number; paid_amount: number };
      const newPaid = Number(row.paid_amount ?? 0) + applied;
      const status = newPaid >= Number(row.net_amount ?? 0) ? 'paid' : 'partially_paid';
      await db.from('erp_invoices').update({ paid_amount: newPaid, status }).eq('id', invoiceId);
    },

    async updateCollectionTotals(collectionId, appliedAmount, unappliedAmount, status) {
      await db.from('erp_collections')
        .update({ applied_amount: appliedAmount, unapplied_amount: unappliedAmount, status, updated_at: new Date().toISOString() })
        .eq('id', collectionId);
    },
  };
}
