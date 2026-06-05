// ============================================================================
// Offline licensing — verifier (Phase P4)
// ----------------------------------------------------------------------------
// Verified at every launch, fully offline. Enforces: signature, edition +
// productCode match the running build, expiry, the terminal cap
// (activations.length <= maxTerminals), and that THIS device holds a seat.
//
// v1 issues maxTerminals=1, but the verifier honors any N — so multi-terminal /
// paid-upgrade / new-edition licensing is a server-side issuance change, not an
// app change.
// ============================================================================

import type { KeyObject } from 'node:crypto';
import { verifyPayload } from './sign';
import type { SignedLicense } from './types';

export type LicenseFailure =
  | 'bad-signature'
  | 'edition-mismatch'
  | 'expired'
  | 'seat-cap-exceeded'
  | 'device-not-activated';

export interface VerifyContext {
  /** Embedded Ed25519 public key (PEM). */
  publicKey: string | KeyObject;
  /** The edition this build runs as (from the edition descriptor). */
  edition: string;
  /** Product code of the running edition. */
  productCode: string;
  /** This device's fingerprint (from fingerprint.ts). */
  deviceFingerprint: string;
  /** Current time (injectable for tests). */
  now?: Date;
}

export type VerifyResult =
  | { ok: true; seatIndex: number; seatsUsed: number; seatsMax: number }
  | { ok: false; reason: LicenseFailure };

export function verifyLicense(license: SignedLicense, ctx: VerifyContext): VerifyResult {
  const { payload, signature } = license;

  // 1. Signature over the canonical payload.
  if (!verifyPayload(payload, signature, ctx.publicKey)) return { ok: false, reason: 'bad-signature' };

  // 2. Edition + product code must match the running build (ties licensing to
  //    the brand/edition abstraction).
  if (payload.edition !== ctx.edition || payload.productCode !== ctx.productCode) {
    return { ok: false, reason: 'edition-mismatch' };
  }

  // 3. Expiry.
  const now = ctx.now ?? new Date();
  if (payload.validUntil && now.getTime() >= new Date(payload.validUntil).getTime()) {
    return { ok: false, reason: 'expired' };
  }

  // 4. Terminal cap — never trust more activations than the license allows.
  if (payload.activations.length > payload.maxTerminals) {
    return { ok: false, reason: 'seat-cap-exceeded' };
  }

  // 5. This device must hold a seat.
  const seatIndex = payload.activations.findIndex((a) => a.deviceFingerprint === ctx.deviceFingerprint);
  if (seatIndex === -1) return { ok: false, reason: 'device-not-activated' };

  return { ok: true, seatIndex, seatsUsed: payload.activations.length, seatsMax: payload.maxTerminals };
}

/** Whether another seat can still be claimed (used by the activation UI). */
export function hasFreeSeat(license: SignedLicense): boolean {
  return license.payload.activations.length < license.payload.maxTerminals;
}
