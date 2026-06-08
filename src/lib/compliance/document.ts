// ============================================================================
// E-Invoicing Compliance — document assembly (Phase 5F). Pure orchestration that
// turns a regime provider + invoice input into a persistable compliance record:
// validate → build normalized document → assign UUID → compute the hash chain
// (PIH) → derive the lifecycle status. Country-agnostic; the result maps directly
// onto erp_tax_submissions (+ the Phase-5F columns). No I/O, no authority calls.
// ============================================================================

import { randomUUID } from 'crypto';
import type { EInvoiceProvider, EInvoiceDocument, ComplianceValidationIssue } from './provider';
import type { ComplianceStatus } from './lifecycle';
import { chainInvoiceHash } from './hash';

export interface AssembleOptions {
  /** Prior document's invoiceHash (omit/null for the first in the chain). */
  previousHash?: string | null;
  /** Override the generated document UUID (e.g. on regeneration). */
  documentUuid?: string;
}

export interface AssembledCompliance {
  documentUuid: string;
  document: EInvoiceDocument;
  issues: ComplianceValidationIssue[];
  /** 'generated' when valid, else 'draft' (held back from the queue). */
  status: ComplianceStatus;
  invoiceHash: string;
  previousInvoiceHash: string;
  qr?: string;
}

/**
 * Canonical string a document hashes over. Real ZATCA hashes canonicalized UBL
 * XML; until that serializer lands, the normalized content is the canonical form
 * (deterministic JSON). Reused unchanged once UBL serialization is added.
 */
export function canonicalize(doc: EInvoiceDocument): string {
  return JSON.stringify(doc.content);
}

/** Assemble a compliance record for `input` using `provider`. Pure. */
export function assembleCompliance<TInput>(
  provider: EInvoiceProvider<TInput>,
  input: TInput,
  opts: AssembleOptions = {},
): AssembledCompliance {
  const issues = provider.validate(input);
  const document = provider.buildDocument(input);
  const { invoiceHash, previousInvoiceHash } = chainInvoiceHash(canonicalize(document), opts.previousHash);
  return {
    documentUuid: opts.documentUuid ?? randomUUID(),
    document,
    issues,
    status: issues.length === 0 ? 'generated' : 'draft',
    invoiceHash,
    previousInvoiceHash,
    qr: document.qr,
  };
}
