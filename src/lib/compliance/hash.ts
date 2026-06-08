// ============================================================================
// E-Invoicing Compliance — invoice hash chain (Phase 5F). Pure + server-only
// (node crypto). Country-agnostic: produces the SHA-256/Base64 invoice hash and
// the previous-invoice-hash (PIH) chaining used by ZATCA (and reusable by any
// regime that chains documents). This builds the chain DATA only; cryptographic
// SIGNING with a real certificate (CSID) remains PAUSED pending credentials.
// ============================================================================

import { createHash } from 'crypto';

/** SHA-256 of `input`, Base64-encoded. Pure. */
export function sha256Base64(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('base64');
}

/** SHA-256 of `input`, lowercase hex. Pure. */
export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Genesis previous-invoice-hash: Base64(SHA-256("0")). The first document in a
 * chain references this constant (ZATCA convention; generic + reusable).
 */
export const GENESIS_PREVIOUS_HASH = sha256Base64('0');

export interface ChainedHash {
  /** This document's hash. */
  invoiceHash: string;
  /** The hash this document chains onto (genesis for the first). */
  previousInvoiceHash: string;
}

/**
 * Compute a document's hash and the previous-invoice-hash it chains onto.
 * `previousHash` is the prior document's `invoiceHash`, or null/undefined for
 * the first document in the chain (→ genesis). Pure.
 */
export function chainInvoiceHash(canonical: string, previousHash?: string | null): ChainedHash {
  return {
    invoiceHash: sha256Base64(canonical),
    previousInvoiceHash: previousHash && previousHash.length > 0 ? previousHash : GENESIS_PREVIOUS_HASH,
  };
}

/** Verify a chain link: does `invoiceHash` match the canonical content? Pure. */
export function verifyInvoiceHash(canonical: string, invoiceHash: string): boolean {
  return sha256Base64(canonical) === invoiceHash;
}
