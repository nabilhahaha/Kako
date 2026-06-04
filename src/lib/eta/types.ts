// ── ETA e-invoice document model (schema v1) ──
// Faithful to the ETA "Document" shape used by the documentsubmissions API.
// Validate field-by-field against the current ETA SDK before production use.

export type EtaDocumentType = 'I' | 'C' | 'D'; // Invoice / Credit note / Debit note
export type EtaReceiverType = 'B' | 'P' | 'F'; // Business / Person / Foreigner
export type EtaItemCodeType = 'EGS' | 'GS1';

export interface EtaAddress {
  country: string; // ISO-2, e.g. "EG"
  governate: string;
  regionCity: string;
  street: string;
  buildingNumber: string;
  branchId?: string;
  postalCode?: string;
  floor?: string;
  room?: string;
  landmark?: string;
  additionalInformation?: string;
}

export interface EtaIssuer {
  type: 'B';
  id: string; // tax registration number
  name: string;
  address: EtaAddress;
}

export interface EtaReceiver {
  type: EtaReceiverType;
  id?: string; // tax reg / national id (omitted for some receiver types)
  name: string;
  address?: Partial<EtaAddress>;
}

export interface EtaAmount {
  currencySold: string; // "EGP"
  amountEGP: number;
  amountSold?: number;
  currencyExchangeRate?: number;
}

export interface EtaTaxableItem {
  taxType: string; // e.g. "T1" (value-added tax)
  amount: number;
  subType: string; // e.g. "V009"
  rate: number; // percentage, e.g. 14
}

export interface EtaInvoiceLine {
  description: string;
  itemType: EtaItemCodeType;
  itemCode: string;
  unitType: string; // ETA UOM code, e.g. "EA"
  quantity: number;
  internalCode: string;
  salesTotal: number;
  totalTaxableFees: number;
  netTotal: number;
  itemsDiscount: number;
  unitValue: EtaAmount;
  discount: { rate: number; amount: number };
  taxableItems: EtaTaxableItem[];
  total: number;
}

export interface EtaTaxTotal {
  taxType: string;
  amount: number;
}

export interface EtaSignature {
  signatureType: 'I' | 'S'; // Issuer / Service-provider
  value: string; // CAdES-BES signature
}

export interface EtaDocument {
  issuer: EtaIssuer;
  receiver: EtaReceiver;
  documentType: EtaDocumentType;
  documentTypeVersion: string;
  dateTimeIssued: string; // ISO-8601 UTC, e.g. "2026-05-30T12:00:00Z"
  taxpayerActivityCode: string;
  internalID: string;
  purchaseOrderReference?: string;
  invoiceLines: EtaInvoiceLine[];
  totalDiscountAmount: number;
  totalSalesAmount: number;
  netAmount: number;
  taxTotals: EtaTaxTotal[];
  totalAmount: number;
  extraDiscountAmount: number;
  totalItemsDiscountAmount: number;
  signatures?: EtaSignature[];
}

// ── Normalized builder input (decoupled from our DB schema) ──

export interface EtaLineInput {
  description: string;
  itemCodeType: EtaItemCodeType;
  itemCode: string;
  internalCode: string;
  unitType: string;
  quantity: number;
  unitPrice: number;
  /** Absolute discount on the line (in EGP), applied before tax. */
  discountAmount?: number;
  /** VAT percentage, e.g. 14. Omit/0 for tax-exempt lines. */
  taxRate?: number;
}

export interface EtaInvoiceInput {
  internalId: string;
  issuedAt: Date;
  issuer: EtaIssuer;
  /** The issuer's ETA-registered taxpayer activity code. */
  taxpayerActivityCode: string;
  receiver: EtaReceiver;
  lines: EtaLineInput[];
  documentType?: EtaDocumentType;
  purchaseOrderReference?: string;
}

// ── API responses (subset) ──

export interface EtaSubmitResponse {
  submissionId?: string;
  acceptedDocuments?: { internalId: string; uuid: string; longId?: string }[];
  rejectedDocuments?: { internalId: string; error?: unknown }[];
}
