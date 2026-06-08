// ============================================================================
// E-Invoicing Compliance — compliance metadata (Phase 5G). The reusable,
// country-agnostic record of compliance artifacts + references that maps 1:1 onto
// erp_tax_submissions (+ the Phase-5F/5G columns). Pure. A connector fills the
// authority-side references (submission/clearance/reporting/provider) once it
// activates; offline we populate UUID, hashes, QR, and XML refs.
// ============================================================================

import type { ComplianceStatus } from './lifecycle';
import type { AssembledCompliance } from './document';

export interface ComplianceMetadata {
  documentUuid: string | null;
  externalInvoiceNumber: string | null;   // authority-assigned number
  internalInvoiceNumber: string | null;   // our invoice_number
  invoiceHash: string | null;
  previousInvoiceHash: string | null;
  qrReference: string | null;             // stored QR artifact handle
  qrPayload: string | null;               // inline Base64 QR
  xmlReference: string | null;            // generated XML storage handle
  signedXmlReference: string | null;      // signed XML storage handle
  submissionReference: string | null;     // authority submission id
  clearanceReference: string | null;      // authority clearance id
  reportingReference: string | null;      // authority reporting id
  providerReference: string | null;       // ASP / intermediary id
  complianceStatus: ComplianceStatus;
  lastAuthorityResponse: unknown | null;
  submissionTimestamp: string | null;     // ISO
  responseTimestamp: string | null;       // ISO
}

/** A blank metadata record at `status` (default draft). Pure. */
export function emptyComplianceMetadata(status: ComplianceStatus = 'draft'): ComplianceMetadata {
  return {
    documentUuid: null, externalInvoiceNumber: null, internalInvoiceNumber: null,
    invoiceHash: null, previousInvoiceHash: null, qrReference: null, qrPayload: null,
    xmlReference: null, signedXmlReference: null, submissionReference: null,
    clearanceReference: null, reportingReference: null, providerReference: null,
    complianceStatus: status, lastAuthorityResponse: null,
    submissionTimestamp: null, responseTimestamp: null,
  };
}

/** Project an assembled (offline) compliance document onto metadata. Pure. */
export function metadataFromAssembled(
  a: AssembledCompliance,
  opts: { internalInvoiceNumber?: string | null } = {},
): ComplianceMetadata {
  return {
    ...emptyComplianceMetadata(a.status),
    documentUuid: a.documentUuid,
    internalInvoiceNumber: opts.internalInvoiceNumber ?? null,
    invoiceHash: a.invoiceHash,
    previousInvoiceHash: a.previousInvoiceHash,
    qrPayload: a.qr ?? null,
  };
}
