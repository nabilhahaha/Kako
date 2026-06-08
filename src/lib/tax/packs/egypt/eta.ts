// ============================================================================
// Global Tax — Egypt ETA country pack (Phase 5C). Pure document builder +
// validation for the Egyptian Tax Authority e-invoice (proposal §2 Egypt pack).
// Maps a finalized document + tax breakdown → the ETA JSON document shape and runs
// ETA statutory validation. Country-pack ISOLATED: no core change; registers
// against the M6 registry. Signing + the submission HTTP connector are a follow-up
// (need ETA credentials/CSID — secrets via KMS, never DB). Flag: KAKO_TAX_EG.
// ============================================================================

import type { TaxCompliancePack } from '../registry';

/** ETA document type codes: I=invoice, C=credit note, D=debit note. */
export type EtaDocType = 'I' | 'C' | 'D';

export interface EtaParty {
  rin: string;            // tax registration / national id
  name: string;
  type?: 'B' | 'P' | 'F'; // business / person / foreigner
  country?: string;       // ISO (default EG)
  governate?: string;
  regionCity?: string;
  street?: string;
  buildingNumber?: string;
}

export interface EtaLineInput {
  description: string;
  itemCode: string;        // EGS / GS1 code
  unitType: string;        // ETA unit code (e.g. 'EA')
  quantity: number;
  unitValue: number;       // unit price (ex tax)
  taxRate: number;         // VAT % (T1)
  discount?: number;
}

export interface EtaDocInput {
  documentType: EtaDocType;
  internalId: string;            // the source document number
  dateTimeIssued: string;        // ISO
  taxpayerActivityCode: string;  // issuer activity code
  issuer: EtaParty;
  receiver: EtaParty;
  lines: EtaLineInput[];
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Build the ETA e-invoice JSON document (pure). The serializer the signer/submitter
 *  consumes; deterministic + testable before any network/cert work. */
export function buildEtaDocument(input: EtaDocInput) {
  const invoiceLines = input.lines.map((l) => {
    const salesTotal = round2(l.quantity * l.unitValue);
    const discount = round2(l.discount ?? 0);
    const net = round2(salesTotal - discount);
    const tax = round2(net * l.taxRate / 100);
    return {
      description: l.description,
      itemType: 'EGS',
      itemCode: l.itemCode,
      unitType: l.unitType,
      quantity: l.quantity,
      unitValue: { currencySold: 'EGP', amountEGP: round2(l.unitValue) },
      salesTotal,
      discount: { rate: salesTotal > 0 ? round2((discount / salesTotal) * 100) : 0, amount: discount },
      netTotal: net,
      total: round2(net + tax),
      taxableItems: [{ taxType: 'T1', amount: tax, rate: l.taxRate }],
    };
  });

  const totalSalesAmount = round2(invoiceLines.reduce((s, l) => s + l.salesTotal, 0));
  const totalDiscount = round2(invoiceLines.reduce((s, l) => s + l.discount.amount, 0));
  const netAmount = round2(totalSalesAmount - totalDiscount);
  const totalTax = round2(invoiceLines.reduce((s, l) => s + l.taxableItems[0].amount, 0));

  return {
    documentType: input.documentType,
    documentTypeVersion: '1.0',
    dateTimeIssued: input.dateTimeIssued,
    taxpayerActivityCode: input.taxpayerActivityCode,
    internalID: input.internalId,
    issuer: { type: input.issuer.type ?? 'B', id: input.issuer.rin, name: input.issuer.name,
      address: { country: input.issuer.country ?? 'EG', governate: input.issuer.governate, regionCity: input.issuer.regionCity, street: input.issuer.street, buildingNumber: input.issuer.buildingNumber } },
    receiver: { type: input.receiver.type ?? 'B', id: input.receiver.rin, name: input.receiver.name,
      address: { country: input.receiver.country ?? 'EG' } },
    invoiceLines,
    totalSalesAmount,
    totalDiscountAmount: totalDiscount,
    netAmount,
    taxTotals: [{ taxType: 'T1', amount: totalTax }],
    totalAmount: round2(netAmount + totalTax),
  };
}

export interface EtaValidationIssue { field: string; message: string }

/** ETA statutory pre-submission validation (pure). */
export function validateEtaDocument(input: EtaDocInput): EtaValidationIssue[] {
  const issues: EtaValidationIssue[] = [];
  if (!input.issuer?.rin) issues.push({ field: 'issuer.rin', message: 'issuer tax registration (RIN) is required' });
  if (!input.taxpayerActivityCode) issues.push({ field: 'taxpayerActivityCode', message: 'issuer activity code is required' });
  if (!input.receiver?.rin && (input.receiver?.type ?? 'B') === 'B') issues.push({ field: 'receiver.rin', message: 'business receiver RIN is required' });
  if (!input.internalId) issues.push({ field: 'internalID', message: 'internal document id is required' });
  if (!input.lines || input.lines.length === 0) issues.push({ field: 'invoiceLines', message: 'at least one line is required' });
  input.lines?.forEach((l, i) => {
    if (!l.itemCode) issues.push({ field: `invoiceLines[${i}].itemCode`, message: 'EGS/GS1 item code is required' });
    if (!l.unitType) issues.push({ field: `invoiceLines[${i}].unitType`, message: 'unit type is required' });
    if (!(l.quantity > 0)) issues.push({ field: `invoiceLines[${i}].quantity`, message: 'quantity must be positive' });
  });
  return issues;
}

/** The Egypt ETA pack descriptor (registered with the M6 registry). */
export const EGYPT_ETA_PACK: TaxCompliancePack = {
  id: 'eta-1.0',
  country: 'EG',
  regime: 'eta',
  version: '1.0.0',
  capabilities: ['e_invoice', 'e_receipt', 'credit_note', 'debit_note', 'digital_signature'],
};
