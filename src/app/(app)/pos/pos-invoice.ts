// Fast Food POS — ZATCA-ready invoice payload builder (pure, no I/O / no React).
//
// Produces a STRUCTURED, self-contained invoice payload from the ticket — enough to (a) print
// a ZATCA-style simplified tax invoice, (b) build the Phase-1 QR, and (c) regenerate the
// invoice / a UBL XML later WITHOUT depending on the live UI. Reuses cartTotals so the stored
// totals are byte-identical to the screen and the server checkout (erp_close_restaurant_order).

import { cartTotals, type CartLine, type CartCharges, type OrderMode } from './pos-cart';
import { zatcaQrPayload } from './zatca-qr';

export type InvoiceType = 'simplified_tax_invoice' | 'tax_invoice';
export type DocType = 'invoice' | 'credit_note';

export interface InvoiceSeller { name: string; vat: string | null; branch: string | null }
export interface InvoiceCustomer { name?: string | null; vat?: string | null; phone?: string | null; address?: string | null }
export interface InvoiceLine { name: string; qty: number; unitPrice: number; total: number; note?: string | null }

export interface PosInvoicePayload {
  type: InvoiceType;
  docType: DocType;
  orderType: OrderMode;
  issueAt: string;            // ISO-8601
  seller: InvoiceSeller;
  customer: InvoiceCustomer;
  lines: InvoiceLine[];
  charges: CartCharges;
  totals: { subtotal: number; discount: number; service: number; tax: number; grandTotal: number };
  payment: { method: string };
}

export interface BuiltInvoice { payload: PosInvoicePayload; qr: string }

/** Build the structured invoice payload + the ZATCA Phase-1 QR string. Pure. */
export function buildPosInvoice(input: {
  lines: readonly CartLine[];
  charges: CartCharges;
  orderType: OrderMode;
  issueAt: string;
  seller: InvoiceSeller;
  customer?: InvoiceCustomer;
  paymentMethod: string;
  type?: InvoiceType;
  docType?: DocType;
}): BuiltInvoice {
  const t = cartTotals(input.lines, input.charges);
  const payload: PosInvoicePayload = {
    type: input.type ?? 'simplified_tax_invoice',
    docType: input.docType ?? 'invoice',
    orderType: input.orderType,
    issueAt: input.issueAt,
    seller: input.seller,
    customer: input.customer ?? {},
    lines: input.lines.map((l) => ({ name: l.name, qty: l.qty, unitPrice: l.price, total: round2(l.qty * l.price), note: l.note ?? null })),
    charges: input.charges,
    totals: { subtotal: t.subtotal, discount: t.discount, service: t.service, tax: t.tax, grandTotal: t.total },
    payment: { method: input.paymentMethod },
  };
  const qr = zatcaQrPayload({
    sellerName: input.seller.name || '',
    vatNumber: input.seller.vat || '',
    timestamp: input.issueAt,
    total: t.total.toFixed(2),
    vatTotal: t.tax.toFixed(2),
  });
  return { payload, qr };
}

function round2(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }
