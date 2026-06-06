// ============================================================================
// Offline licensing — activation / install (Phase P4)
// ----------------------------------------------------------------------------
// Security model: the licensing SERVER holds the private key and always issues a
// COMPLETE signed license. Activation, paid upgrade, renewal and transfer are
// all expressed as a newer signed license (higher `version`). The app is
// VERIFY-ONLY — it never mutates or re-signs a license — so there is no private
// key on the device. `installLicense` accepts a newer, validly-signed license
// and rejects replays/downgrades.
//
// Online activation: POST the request to the server, receive the signed license,
// install it. Air-gapped: the request is shown as a code; the server's response
// code is the signed license, pasted back in.
// ============================================================================

import type { KeyObject } from 'node:crypto';
import { verifyPayload } from './sign';
import type { SignedLicense } from './types';

/** What the device sends to the licensing server to claim a seat. */
export interface ActivationRequest {
  licenseId: string;
  edition: string;
  deviceFingerprint: string;
  /** Current license version on the device (0 if none) — lets the server bump. */
  currentVersion: number;
  requestedAt: string;
}

export function buildActivationRequest(
  licenseId: string,
  edition: string,
  deviceFingerprint: string,
  current: SignedLicense | null,
): ActivationRequest {
  return {
    licenseId,
    edition,
    deviceFingerprint,
    currentVersion: current?.payload.version ?? 0,
    requestedAt: new Date().toISOString(),
  };
}

export type InstallResult =
  | { ok: true; license: SignedLicense }
  | { ok: false; reason: 'bad-signature' | 'edition-mismatch' | 'not-newer' | 'wrong-license' };

/** Install a server-issued license, replacing the current one. Enforces:
 *  valid signature, matching edition, same licenseId (when replacing), and a
 *  strictly-greater version (replay/downgrade protection). */
export function installLicense(
  current: SignedLicense | null,
  incoming: SignedLicense,
  ctx: { publicKey: string | KeyObject; edition: string },
): InstallResult {
  if (!verifyPayload(incoming.payload, incoming.signature, ctx.publicKey)) return { ok: false, reason: 'bad-signature' };
  if (incoming.payload.edition !== ctx.edition) return { ok: false, reason: 'edition-mismatch' };
  if (current) {
    if (incoming.payload.licenseId !== current.payload.licenseId) return { ok: false, reason: 'wrong-license' };
    if (incoming.payload.version <= current.payload.version) return { ok: false, reason: 'not-newer' };
  }
  return { ok: true, license: incoming };
}
