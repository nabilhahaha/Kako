// ============================================================================
// Offline licensing — Ed25519 sign/verify (Phase P4)
// ----------------------------------------------------------------------------
// The licensing server holds the PRIVATE key and signs licenses + upgrade
// tokens; the app embeds only the PUBLIC key and verifies. Uses node:crypto
// Ed25519 (no dependency). Signing is over a CANONICAL (sorted-key) JSON of the
// payload so re-serialization can't change the signed bytes.
// ============================================================================

import { sign as edSign, verify as edVerify, generateKeyPairSync, type KeyObject } from 'node:crypto';

/** Deterministic JSON: object keys sorted recursively. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortDeep((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

/** Sign a payload with an Ed25519 private key (PEM or KeyObject). Returns base64. */
export function signPayload(payload: unknown, privateKey: string | KeyObject): string {
  const data = Buffer.from(canonicalize(payload), 'utf8');
  return edSign(null, data, privateKey as KeyObject).toString('base64');
}

/** Verify a base64 signature over a payload with an Ed25519 public key. */
export function verifyPayload(payload: unknown, signature: string, publicKey: string | KeyObject): boolean {
  try {
    const data = Buffer.from(canonicalize(payload), 'utf8');
    return edVerify(null, data, publicKey as KeyObject, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

/** Generate an Ed25519 keypair (PEM). Used by the licensing server + tests. */
export function generateLicenseKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}
