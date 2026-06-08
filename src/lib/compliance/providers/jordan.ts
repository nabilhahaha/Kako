// ============================================================================
// E-Invoicing Compliance — Jordan JoFotara provider (Phase 5G, Part 5). Pure,
// self-contained reference-readiness pack (cash / receivable / return invoices,
// QR support, buyer optionality, auto-populated seller profile) adapted to the
// country-agnostic EInvoiceProvider interface. Authority submission is PAUSED
// (no JoFotara credentials). No live government submission.
// ============================================================================

import { Buffer } from 'buffer';
import type { EInvoiceProvider, EInvoiceDocument, ComplianceValidationIssue } from '../provider';
import { PausedConnectorError } from '../provider';

export type JoInvoiceType = 'cash' | 'receivable' | 'return';

export interface JoLineInput {
  description: string;
  quantity: number;
  unitPrice: number;     // ex tax
  taxRate?: number;      // default 16 (general sales tax)
}

export interface JoParty { name: string; tin?: string }

export interface JoInvoiceInput {
  invoiceType: JoInvoiceType;
  invoiceNumber: string;
  issueDate: string;            // ISO
  seller: JoParty;              // auto-populated from the company profile
  buyer?: JoParty;             // optional per buyer-optionality rules
  originalInvoiceNumber?: string; // required for returns
  lines: JoLineInput[];
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Normalize a JoFotara invoice (lines + totals). Pure. */
export function buildJoInvoice(input: JoInvoiceInput) {
  const lines = input.lines.map((l) => {
    const rate = l.taxRate ?? 16;
    const net = round2(l.quantity * l.unitPrice);
    const tax = round2(net * rate / 100);
    return { description: l.description, quantity: l.quantity, unitPrice: round2(l.unitPrice), taxRate: rate, net, tax, total: round2(net + tax) };
  });
  const net = round2(lines.reduce((s, l) => s + l.net, 0));
  const taxTotal = round2(lines.reduce((s, l) => s + l.tax, 0));
  return {
    invoiceType: input.invoiceType,
    invoiceNumber: input.invoiceNumber,
    issueDate: input.issueDate,
    seller: input.seller,
    buyer: input.buyer,
    originalInvoiceNumber: input.originalInvoiceNumber,
    lines,
    netAmount: net,
    taxTotal,
    totalAmount: round2(net + taxTotal),
  };
}

/** Deterministic Base64 QR payload (seller TIN, number, date, totals). Pure. */
export function joQrFromInvoice(inv: ReturnType<typeof buildJoInvoice>): string {
  const payload = [inv.seller.tin ?? '', inv.invoiceNumber, inv.issueDate, inv.totalAmount.toFixed(2), inv.taxTotal.toFixed(2)].join('|');
  return Buffer.from(payload, 'utf8').toString('base64');
}

/** JoFotara pre-submission validation (pure). Buyer is optional. */
export function validateJoInvoice(input: JoInvoiceInput): ComplianceValidationIssue[] {
  const issues: ComplianceValidationIssue[] = [];
  if (!input.invoiceNumber) issues.push({ field: 'invoiceNumber', message: 'invoice number is required' });
  if (!input.issueDate) issues.push({ field: 'issueDate', message: 'issue date is required' });
  if (!input.seller?.name) issues.push({ field: 'seller.name', message: 'seller profile is required (auto-populated)' });
  if (input.invoiceType === 'return' && !input.originalInvoiceNumber) {
    issues.push({ field: 'originalInvoiceNumber', message: 'a return invoice requires the original invoice number' });
  }
  if (!input.lines || input.lines.length === 0) issues.push({ field: 'lines', message: 'at least one line is required' });
  return issues;
}

export const jordanProvider: EInvoiceProvider<JoInvoiceInput> = {
  id: 'jofotara-1.0',
  country: 'JO',
  regime: 'jofotara',
  version: '1.0.0',
  capabilities: ['e_invoice', 'qr', 'credit_note', 'reporting'],

  validate(input): ComplianceValidationIssue[] {
    return validateJoInvoice(input);
  },

  buildDocument(input): EInvoiceDocument {
    const inv = buildJoInvoice(input);
    return {
      country: 'JO',
      regime: 'jofotara',
      format: 'json',
      content: inv,
      qr: joQrFromInvoice(inv),
      totals: { net: inv.netAmount, tax: inv.taxTotal, total: inv.totalAmount },
    };
  },

  buildQr(input): string {
    return joQrFromInvoice(buildJoInvoice(input));
  },

  async submit(): Promise<never> {
    throw new PausedConnectorError('jofotara');
  },
};
