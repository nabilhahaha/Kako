// ============================================================================
// Offline licensing — document model (Phase P4)
// ----------------------------------------------------------------------------
// The signed license carries the FULL commercial model from v1 even though v1
// enforces a single terminal: per-customer, per-device activations, terminal
// cap, paid-upgrade tier/expiry, edition binding, and a reserved multi-store
// group id. Expanding later (more seats, upgrades, new editions) is a
// server-side issuance change, not an app re-architecture.
// ============================================================================

import type { EditionId } from '@/lib/edition/editions';

export interface Activation {
  /** Salted device fingerprint hash (see fingerprint.ts). */
  deviceFingerprint: string;
  /** ISO timestamp the seat was claimed. */
  activatedAt: string;
  /** Optional human label for the terminal. */
  label?: string;
}

/** The signed payload (everything the signature covers — `signature` excluded). */
export interface LicensePayload {
  /** Unique license id. */
  licenseId: string;
  /** Customer this license was issued to (per-customer licensing). */
  customerId: string;
  /** Edition this license unlocks — must match the running build. */
  edition: EditionId;
  /** Product code (mirrors the edition descriptor). */
  productCode: string;
  /** Paid tier (e.g. 'standard' | 'pro'); free-form, gates features. */
  tier: string;
  /** ISO issue timestamp. */
  issuedAt: string;
  /** ISO expiry (null = perpetual). */
  validUntil: string | null;
  /** Terminal/seat cap. v1 issues 1; the verifier honors any N. */
  maxTerminals: number;
  /** Claimed device seats. */
  activations: Activation[];
  /** Reserved for multi-store chains (per-store sub-licenses under one customer). */
  storeGroupId?: string;
  /** Edition/tier feature flags. */
  features: Record<string, boolean | number | string>;
  /** Monotonic version, bumped on every re-issue/upgrade (replay protection). */
  version: number;
}

/** A license file = signed payload + detached signature (base64). */
export interface SignedLicense {
  payload: LicensePayload;
  /** Ed25519 signature (base64) over the canonical payload. */
  signature: string;
}

/** An upgrade token re-issued by the licensing server to raise tier / seats /
 *  expiry without a full reactivation. Signed the same way. */
export interface UpgradePayload {
  licenseId: string;
  /** New values to apply (only present fields change). */
  tier?: string;
  maxTerminals?: number;
  validUntil?: string | null;
  features?: Record<string, boolean | number | string>;
  /** Must be > the current license version to apply. */
  version: number;
  issuedAt: string;
}

export interface SignedUpgrade {
  payload: UpgradePayload;
  signature: string;
}
