// ── ETA document signing (Phase 2) ──
// ETA requires each submitted document to carry a CAdES-BES signature produced
// with the issuer's accredited e-seal certificate (USB token or HSM). Because
// the certificate is per-company and lives outside this app, signing is behind
// a pluggable interface: wire a real signer (local token agent or cloud HSM)
// when credentials exist. Until then UnconfiguredSigner makes the gap explicit.

import type { EtaDocument } from './types';
import { etaConfig } from './config';

export interface DocumentSigner {
  /** Returns the CAdES-BES signature value for the canonical serialization. */
  sign(canonical: string): Promise<string>;
}

export class UnconfiguredSigner implements DocumentSigner {
  async sign(): Promise<string> {
    throw new Error(
      'ETA signing provider not configured. Set ETA_SIGNING_URL to your e-seal ' +
        'signing service (token agent or HSM). See docs/ETA.md.',
    );
  }
}

/**
 * Signs via an external e-seal service over HTTP — the common ETA pattern: a
 * local "e-invoice signer" agent (USB token) or an HSM front exposes an
 * endpoint that takes the canonical string and returns the CAdES-BES value.
 * POST { document } → expects { signature } (or { value }) in the response.
 */
export class HttpDocumentSigner implements DocumentSigner {
  constructor(private url: string, private token?: string) {}

  async sign(canonical: string): Promise<string> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify({ document: canonical }),
    });
    if (!res.ok) {
      throw new Error(`ETA signing service failed: ${res.status}`);
    }
    const json = (await res.json()) as { signature?: string; value?: string };
    const value = json.signature ?? json.value;
    if (!value) throw new Error('ETA signing service returned no signature');
    return value;
  }
}

/** Returns the configured signer (HTTP service if ETA_SIGNING_URL is set, else
 *  the explicit no-op signer that surfaces the missing-config error). */
export function getSigner(): DocumentSigner {
  if (etaConfig.signingUrl) {
    return new HttpDocumentSigner(etaConfig.signingUrl, etaConfig.signingToken || undefined);
  }
  return new UnconfiguredSigner();
}

/**
 * ETA canonical serialization ("Serialize") — the exact string that must be
 * hashed and signed. Algorithm per the ETA SDK: for each property emit the
 * upper-cased name in quotes; for arrays re-emit the property name before each
 * element; recurse into objects; primitives are emitted quoted.
 *
 * NOTE: This is a best-effort implementation of the published algorithm and
 * MUST be validated against the ETA SDK test vectors before production signing.
 */
export function serializeForSignature(value: unknown): string {
  return canon(value);
}

function canon(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    // Arrays are handled by the parent (which re-emits the property name); a
    // bare array just serializes its elements in order.
    return value.map((el) => canon(el)).join('');
  }
  if (typeof value === 'object') {
    let out = '';
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (val === undefined) continue;
      out += `"${key.toUpperCase()}"`;
      if (Array.isArray(val)) {
        for (const el of val) {
          out += `"${key.toUpperCase()}"`;
          out += canon(el);
        }
      } else if (val !== null && typeof val === 'object') {
        out += canon(val);
      } else {
        out += `"${String(val)}"`;
      }
    }
    return out;
  }
  return `"${String(value)}"`;
}

/** Attach the issuer signature to a document, producing the payload ETA expects. */
export async function signDocument(
  doc: EtaDocument,
  signer: DocumentSigner,
): Promise<EtaDocument> {
  const value = await signer.sign(serializeForSignature(doc));
  return { ...doc, signatures: [{ signatureType: 'I', value }] };
}
