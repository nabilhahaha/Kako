// ============================================================================
// Global Tax — Saudi ZATCA country pack (Phase 5D). Pure builder + validation for
// ZATCA Phase 1 (simplified: QR) and Phase 2 (standard: cleared invoice). Produces
// the normalized invoice + the mandatory Base64 TLV QR (tags 1–5). Country-pack
// ISOLATED; registers against the M6 registry. UBL XML serialization, UUID/PIH hash
// chain, and CSID signing + clearance/reporting connectors are the follow-up (need
// ZATCA credentials/certs — secrets via KMS, never DB). Flag: KAKO_TAX_SA.
// ============================================================================

import type { TaxCompliancePack } from '../registry';

export type ZatcaInvoiceType = 'standard' | 'simplified'; // B2B clearance vs B2C reporting

export interface ZatcaLineInput {
  description: string;
  quantity: number;
  unitPrice: number;   // ex VAT
  taxRate: number;     // VAT %
}

export interface ZatcaInvoiceInput {
  invoiceType: ZatcaInvoiceType;
  invoiceNumber: string;
  issueDateTime: string;       // ISO
  sellerName: string;
  sellerVatNumber: string;     // 15-digit VAT registration
  buyerVatNumber?: string;     // required for standard (B2B)
  lines: ZatcaLineInput[];
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Normalize a ZATCA invoice (lines + totals). Pure. */
export function buildZatcaInvoice(input: ZatcaInvoiceInput) {
  const lines = input.lines.map((l) => {
    const net = round2(l.quantity * l.unitPrice);
    const vat = round2(net * l.taxRate / 100);
    return { description: l.description, quantity: l.quantity, unitPrice: round2(l.unitPrice), net, vatRate: l.taxRate, vat, total: round2(net + vat) };
  });
  const taxExclusive = round2(lines.reduce((s, l) => s + l.net, 0));
  const vatTotal = round2(lines.reduce((s, l) => s + l.vat, 0));
  return {
    invoiceType: input.invoiceType,
    invoiceNumber: input.invoiceNumber,
    issueDateTime: input.issueDateTime,
    seller: { name: input.sellerName, vatNumber: input.sellerVatNumber },
    buyer: input.buyerVatNumber ? { vatNumber: input.buyerVatNumber } : undefined,
    lines,
    taxExclusiveAmount: taxExclusive,
    vatTotal,
    taxInclusiveAmount: round2(taxExclusive + vatTotal),
  };
}

/** One TLV field: tag (1 byte) + length (1 byte) + UTF-8 value. */
function tlv(tag: number, value: string): Buffer {
  const v = Buffer.from(value, 'utf8');
  return Buffer.concat([Buffer.from([tag]), Buffer.from([v.length]), v]);
}

export interface ZatcaQrInput {
  sellerName: string;
  sellerVatNumber: string;
  timestamp: string;     // ISO
  invoiceTotal: string;  // tax-inclusive total (string, 2dp)
  vatTotal: string;      // VAT total (string, 2dp)
}

/** ZATCA Phase-1 mandatory Base64 TLV QR (tags 1..5). Pure + deterministic. */
export function generateZatcaTlvQr(input: ZatcaQrInput): string {
  return Buffer.concat([
    tlv(1, input.sellerName),
    tlv(2, input.sellerVatNumber),
    tlv(3, input.timestamp),
    tlv(4, input.invoiceTotal),
    tlv(5, input.vatTotal),
  ]).toString('base64');
}

/** Convenience: build the QR straight from a normalized invoice. */
export function zatcaQrFromInvoice(inv: ReturnType<typeof buildZatcaInvoice>): string {
  return generateZatcaTlvQr({
    sellerName: inv.seller.name,
    sellerVatNumber: inv.seller.vatNumber,
    timestamp: inv.issueDateTime,
    invoiceTotal: inv.taxInclusiveAmount.toFixed(2),
    vatTotal: inv.vatTotal.toFixed(2),
  });
}

export interface ZatcaValidationIssue { field: string; message: string }

/** ZATCA pre-submission validation (pure). */
export function validateZatcaInvoice(input: ZatcaInvoiceInput): ZatcaValidationIssue[] {
  const issues: ZatcaValidationIssue[] = [];
  if (!/^\d{15}$/.test(input.sellerVatNumber ?? '')) issues.push({ field: 'sellerVatNumber', message: 'seller VAT number must be 15 digits' });
  if (!input.invoiceNumber) issues.push({ field: 'invoiceNumber', message: 'invoice number is required' });
  if (!input.issueDateTime) issues.push({ field: 'issueDateTime', message: 'issue date/time is required' });
  if (input.invoiceType === 'standard' && !/^\d{15}$/.test(input.buyerVatNumber ?? '')) {
    issues.push({ field: 'buyerVatNumber', message: 'standard (B2B clearance) invoice requires a 15-digit buyer VAT number' });
  }
  if (!input.lines || input.lines.length === 0) issues.push({ field: 'lines', message: 'at least one line is required' });
  return issues;
}

/** The Saudi ZATCA pack descriptor (registered with the M6 registry). */
export const SAUDI_ZATCA_PACK: TaxCompliancePack = {
  id: 'zatca-2.0',
  country: 'SA',
  regime: 'zatca',
  version: '2.0.0',
  capabilities: ['e_invoice', 'simplified', 'clearance', 'reporting', 'qr', 'digital_signature', 'credit_note', 'debit_note'],
};
