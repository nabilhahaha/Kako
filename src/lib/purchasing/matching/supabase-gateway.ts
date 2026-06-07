// ============================================================================
// Purchasing — Supabase implementation of the MatchGateway (0190 tables + 0005
// PO/GRN). Thin DB adapter under the caller's RLS (branch-scoped). server-only.
// ============================================================================

import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { MatchGateway, InvoiceLineForMatch, PoLineRef, LineMatchStatus } from './gateway';

type Db = Awaited<ReturnType<typeof createClient>>;

export function createSupabaseMatchGateway(db: Db): MatchGateway {
  return {
    async loadInvoiceLines(invoiceId) {
      const { data } = await db.from('erp_supplier_invoice_lines')
        .select('id, quantity, unit_price, po_line_id, gr_line_id')
        .eq('supplier_invoice_id', invoiceId);
      return ((data ?? []) as Array<Record<string, unknown>>).map((l): InvoiceLineForMatch => ({
        id: l.id as string,
        invoicedQty: Number(l.quantity),
        invoiceUnitPrice: Number(l.unit_price),
        poLineId: (l.po_line_id as string | null) ?? null,
        grLineId: (l.gr_line_id as string | null) ?? null,
      }));
    },

    async loadPoLine(poLineId) {
      const { data } = await db.from('erp_purchase_order_lines')
        .select('quantity, unit_price').eq('id', poLineId).maybeSingle();
      if (!data) return null;
      const row = data as { quantity: number; unit_price: number };
      return { orderedQty: Number(row.quantity), unitPrice: Number(row.unit_price) } as PoLineRef;
    },

    async loadReceivedQty(poLineId, grLineId) {
      if (grLineId) {
        const { data } = await db.from('erp_goods_receipt_lines')
          .select('quantity_received').eq('id', grLineId).maybeSingle();
        return data ? Number((data as { quantity_received: number }).quantity_received) : 0;
      }
      // No GR line: received qty tracked on the PO line.
      if (poLineId) {
        const { data } = await db.from('erp_purchase_order_lines')
          .select('received_qty').eq('id', poLineId).maybeSingle();
        return data ? Number((data as { received_qty: number }).received_qty) : 0;
      }
      return 0;
    },

    async saveLineMatch(lineId, status: LineMatchStatus, flags) {
      await db.from('erp_supplier_invoice_lines')
        .update({ match_status: status, match_flags: flags }).eq('id', lineId);
    },

    async saveInvoiceMatch(invoiceId, matchStatus: LineMatchStatus, invoiceStatus) {
      await db.from('erp_supplier_invoices')
        .update({ match_status: matchStatus, status: invoiceStatus, updated_at: new Date().toISOString() })
        .eq('id', invoiceId);
    },
  };
}
