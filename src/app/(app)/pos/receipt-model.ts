// Fast Food POS — renderer-agnostic RECEIPT MODEL (pure, no I/O / no React).
//
// Maps an issued POS invoice (the source of truth in erp_pos_invoices) into a structured
// receipt model that EVERY renderer consumes: the browser/HTML receipt today, an ESC/POS
// thermal renderer and a desktop-bridge renderer later. Receipt content is therefore derived
// from invoice DATA, never from HTML — keeping the ZATCA-ready structure intact across devices.

import type { PosInvoiceView } from './pos-actions';

export interface ReceiptModel {
  isCredit: boolean;
  typeLabel: { ar: string; en: string };
  seller: { name: string; vat: string | null };
  meta: { invoiceNumber: string; issueAt: string; orderType: string | null; cashier: string | null; customer: string | null; paymentMethod: string | null };
  lines: { name: string; qty: number; unitPrice: number; total: number; note?: string | null }[];
  totals: { subtotal: number; discount: number; service: number; tax: number; grand: number };
  qr: string | null;
}

export function toReceiptModel(inv: PosInvoiceView): ReceiptModel {
  const isCredit = inv.docType === 'credit_note';
  return {
    isCredit,
    typeLabel: isCredit
      ? { ar: 'إشعار دائن', en: 'Credit Note' }
      : { ar: 'فاتورة ضريبية مبسطة', en: 'Simplified Tax Invoice' },
    seller: { name: inv.sellerName ?? '', vat: inv.sellerVat },
    meta: {
      invoiceNumber: inv.invoiceNumber, issueAt: inv.issueAt, orderType: inv.orderType,
      cashier: inv.cashierName, customer: inv.customerName, paymentMethod: inv.paymentMethod,
    },
    lines: inv.lines,
    totals: { subtotal: inv.subtotal, discount: inv.discountTotal, service: inv.serviceTotal, tax: inv.taxTotal, grand: inv.grandTotal },
    qr: inv.zatcaQr,
  };
}

/**
 * Pure ESC/POS-style plain-text receipt (40-col). NOT wired to hardware yet — it proves the
 * model renders to a thermal layout, and is the seam the device-bridge phase will feed to an
 * ESC/POS encoder. Browser print stays the first/only active print mode for now.
 */
export function receiptTextLines(m: ReceiptModel, width = 40): string[] {
  const line = (l: string) => l.slice(0, width);
  const lr = (l: string, r: string) => {
    const space = Math.max(1, width - l.length - r.length);
    return (l + ' '.repeat(space) + r).slice(0, width);
  };
  const out: string[] = [];
  out.push(center(m.seller.name, width));
  out.push(center(m.typeLabel.en, width));
  if (m.seller.vat) out.push(center(`VAT: ${m.seller.vat}`, width));
  out.push('-'.repeat(width));
  out.push(lr(`#${m.meta.invoiceNumber}`, m.meta.issueAt.slice(0, 16).replace('T', ' ')));
  if (m.meta.cashier) out.push(line(`Cashier: ${m.meta.cashier}`));
  out.push('-'.repeat(width));
  for (const it of m.lines) {
    out.push(lr(`${it.qty} x ${it.name}`, it.total.toFixed(2)));
    if (it.note) out.push(line(`   * ${it.note}`));
  }
  out.push('-'.repeat(width));
  out.push(lr('Subtotal', m.totals.subtotal.toFixed(2)));
  if (m.totals.discount) out.push(lr('Discount', (-Math.abs(m.totals.discount)).toFixed(2)));
  if (m.totals.service) out.push(lr('Service', m.totals.service.toFixed(2)));
  if (m.totals.tax) out.push(lr('VAT', m.totals.tax.toFixed(2)));
  out.push(lr('TOTAL', m.totals.grand.toFixed(2)));
  if (m.meta.paymentMethod) out.push(lr('Paid', m.meta.paymentMethod));
  return out;
}

function center(s: string, width: number): string {
  s = s.slice(0, width);
  const pad = Math.max(0, Math.floor((width - s.length) / 2));
  return (' '.repeat(pad) + s).slice(0, width);
}
