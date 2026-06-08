// ============================================================================
// E-Invoicing Compliance — PEPPOL / PINT-AE shared types (Phase 5G, Part 4).
// Reference-readiness for the UAE 5-corner model (PINT-AE over PEPPOL BIS Billing
// 3.0, AS4 transport via an Accredited Service Provider). Pure types + validation
// + a normalized builder; the full UBL-XML serializer and the AS4/ASP transport
// are the PAUSED follow-up (no ASP onboarding/credentials). No live FTA/ASP calls.
// ============================================================================

/** UNCL1001 business process subset relevant to billing. */
export type PeppolBusinessProcess = 'invoice' | 'credit_note' | 'debit_note' | 'self_billed_invoice';

/** A PEPPOL electronic address / identifier: scheme id + value (e.g. AE TRN). */
export interface PeppolEndpoint {
  scheme: string;   // e.g. '0235' (AE Tax Registration Number scheme)
  value: string;
}

export interface PeppolParty {
  legalName: string;
  legalIdentifier?: PeppolEndpoint;   // buyer/seller legal identifier
  electronicAddress: PeppolEndpoint;  // PEPPOL participant id (mandatory)
  vat?: string;                       // TRN
}

/** UNCL5305 tax category: S standard, Z zero, E exempt, AE reverse-charge, O out-of-scope. */
export type PeppolTaxCategoryCode = 'S' | 'Z' | 'E' | 'AE' | 'O' | 'G';

export interface PeppolTaxCategory {
  code: PeppolTaxCategoryCode;
  percent: number;
}

/** UNCL4461 payment means code (e.g. '30' credit transfer, '10' cash, '54' card). */
export interface PeppolPaymentMeans {
  code: string;
  payeeAccount?: string;
}

export interface PintAeLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taxCategory: PeppolTaxCategory;
}

export interface PintAeInvoiceInput {
  profileId: string;                  // e.g. 'urn:peppol:...:billing:3.0'
  businessProcess: PeppolBusinessProcess;
  invoiceNumber: string;
  issueDate: string;                  // ISO date
  seller: PeppolParty;
  buyer: PeppolParty;
  lines: PintAeLineInput[];
  paymentMeans?: PeppolPaymentMeans;
}

/** PEPPOL Message Level Status (MLS) — ASP acknowledgement outcomes. */
export type MessageLevelStatus = 'acknowledged' | 'accepted' | 'accepted_with_warning' | 'rejected';

export interface AspError { code: string; message: string }

export interface AspResponse {
  status: MessageLevelStatus;
  providerReference?: string;
  errors?: AspError[];
  warnings?: AspError[];
}

export interface PeppolValidationIssue { field: string; message: string }

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** PINT-AE / BIS 3.0 pre-transport validation (pure). */
export function validatePintAeInvoice(input: PintAeInvoiceInput): PeppolValidationIssue[] {
  const issues: PeppolValidationIssue[] = [];
  if (!input.invoiceNumber) issues.push({ field: 'invoiceNumber', message: 'invoice number is required' });
  if (!input.profileId) issues.push({ field: 'profileId', message: 'PEPPOL profile id is required' });
  if (!input.seller?.electronicAddress?.value) issues.push({ field: 'seller.electronicAddress', message: 'seller electronic address is required' });
  if (!input.buyer?.electronicAddress?.value) issues.push({ field: 'buyer.electronicAddress', message: 'buyer electronic address is required' });
  if (!input.seller?.legalName) issues.push({ field: 'seller.legalName', message: 'seller legal name is required' });
  if (!input.buyer?.legalName) issues.push({ field: 'buyer.legalName', message: 'buyer legal name is required' });
  if (!input.lines || input.lines.length === 0) issues.push({ field: 'lines', message: 'at least one line is required' });
  return issues;
}

/** Normalize a PINT-AE invoice (lines + totals + tax breakdown). Pure. */
export function buildPintAeDocument(input: PintAeInvoiceInput) {
  const lines = input.lines.map((l) => {
    const net = round2(l.quantity * l.unitPrice);
    const vat = round2(net * l.taxCategory.percent / 100);
    return { description: l.description, quantity: l.quantity, unitPrice: round2(l.unitPrice), taxCategory: l.taxCategory, net, vat, total: round2(net + vat) };
  });
  const net = round2(lines.reduce((s, l) => s + l.net, 0));
  const vatTotal = round2(lines.reduce((s, l) => s + l.vat, 0));
  return {
    profileId: input.profileId,
    businessProcess: input.businessProcess,
    invoiceNumber: input.invoiceNumber,
    issueDate: input.issueDate,
    seller: input.seller,
    buyer: input.buyer,
    paymentMeans: input.paymentMeans,
    lines,
    netAmount: net,
    vatTotal,
    totalAmount: round2(net + vatTotal),
    // format: 'peppol-bis-3' — UBL-XML serialization is the paused follow-up
  };
}
