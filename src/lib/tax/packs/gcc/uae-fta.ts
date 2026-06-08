// ============================================================================
// Global Tax — UAE FTA country pack (Phase 5E). Pure invoice normalization +
// validation for UAE VAT (5%) reporting + e-invoicing readiness (proposal §2 UAE
// pack). Country-pack ISOLATED; registers against the M6 registry. The FTA
// e-invoicing connector activates when the mandate lands (creds via KMS). Flag:
// KAKO_TAX_AE.
// ============================================================================

import type { TaxCompliancePack } from '../registry';

export interface FtaLineInput {
  description: string;
  quantity: number;
  unitPrice: number;   // ex VAT
  taxRate?: number;    // default 5
  zeroRated?: boolean; // exports / qualifying supplies
}

export interface FtaInvoiceInput {
  invoiceNumber: string;
  issueDate: string;         // ISO
  sellerTrn: string;         // 15-digit Tax Registration Number
  buyerTrn?: string;
  lines: FtaLineInput[];
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Normalize a UAE FTA invoice (5% standard, zero-rated supported). Pure. */
export function buildFtaInvoice(input: FtaInvoiceInput) {
  const lines = input.lines.map((l) => {
    const rate = l.zeroRated ? 0 : (l.taxRate ?? 5);
    const net = round2(l.quantity * l.unitPrice);
    const vat = round2(net * rate / 100);
    return { description: l.description, quantity: l.quantity, unitPrice: round2(l.unitPrice), vatRate: rate, net, vat, total: round2(net + vat) };
  });
  const net = round2(lines.reduce((s, l) => s + l.net, 0));
  const vatTotal = round2(lines.reduce((s, l) => s + l.vat, 0));
  return {
    invoiceNumber: input.invoiceNumber, issueDate: input.issueDate,
    seller: { trn: input.sellerTrn }, buyer: input.buyerTrn ? { trn: input.buyerTrn } : undefined,
    lines, netAmount: net, vatTotal, totalAmount: round2(net + vatTotal),
  };
}

export interface FtaValidationIssue { field: string; message: string }

/** UAE FTA validation (pure). */
export function validateFtaInvoice(input: FtaInvoiceInput): FtaValidationIssue[] {
  const issues: FtaValidationIssue[] = [];
  if (!/^\d{15}$/.test(input.sellerTrn ?? '')) issues.push({ field: 'sellerTrn', message: 'seller TRN must be 15 digits' });
  if (!input.invoiceNumber) issues.push({ field: 'invoiceNumber', message: 'invoice number is required' });
  if (!input.lines || input.lines.length === 0) issues.push({ field: 'lines', message: 'at least one line is required' });
  return issues;
}

export const UAE_FTA_PACK: TaxCompliancePack = {
  id: 'fta-1.0', country: 'AE', regime: 'fta', version: '1.0.0',
  capabilities: ['e_invoice', 'simplified', 'reporting'],
};
