// ============================================================================
// E-Invoicing Compliance — certificate store contract (Phase 5F). Pure types +
// a DB-free gateway interface. This is the STORE ARCHITECTURE only: it models
// certificate metadata + lifecycle and references to material held encrypted at
// rest (storage/KMS ref, never inline key bytes). Certificate ISSUANCE, CSR/CSID
// onboarding, the OTP flow, and production credentials remain PAUSED — none of
// that is implemented here; this only gives those flows a home to land in later.
// ============================================================================

/** Sandbox vs production credential lineage. */
export type CertificateKind = 'sandbox' | 'production';

/** Certificate lifecycle. `pending` = requested/onboarding not complete. */
export type CertificateStatus = 'pending' | 'active' | 'expired' | 'revoked';

export interface ComplianceCertificate {
  id: string;
  companyId: string;
  legalEntityId?: string | null;
  registrationId?: string | null;
  country: string;
  regime: string;            // 'zatca' | 'eta' | 'fta' | …
  kind: CertificateKind;
  label: string;
  status: CertificateStatus;
  serial?: string | null;
  subject?: string | null;
  issuer?: string | null;
  fingerprint?: string | null;
  notBefore?: string | null; // ISO
  notAfter?: string | null;  // ISO
  /** Storage/KMS ref to the CSR (architecture only — not generated here). */
  csrRef?: string | null;
  /** Storage/KMS ref to encrypted material (NEVER inline key bytes). */
  materialRef?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * True when a certificate is usable for signing at `now`: active and within its
 * validity window. Pure. (Whether a usable cert EXISTS for a tenant is exactly
 * what gates activation of the paused authority connectors.)
 */
export function isCertificateUsable(cert: ComplianceCertificate, now: Date): boolean {
  if (cert.status !== 'active') return false;
  const t = now.getTime();
  if (cert.notBefore && Date.parse(cert.notBefore) > t) return false;
  if (cert.notAfter && Date.parse(cert.notAfter) < t) return false;
  return true;
}

/** Pick the best usable cert for a regime (prefers production over sandbox). Pure. */
export function selectActiveCertificate(
  certs: readonly ComplianceCertificate[],
  regime: string,
  now: Date,
): ComplianceCertificate | undefined {
  const usable = certs.filter((c) => c.regime === regime && isCertificateUsable(c, now));
  return usable.find((c) => c.kind === 'production') ?? usable[0];
}

/**
 * DB-free certificate store contract. A Supabase-backed implementation lands
 * with the connectors; this interface lets the platform + tests depend on the
 * shape without any live credential handling.
 */
export interface CertificateStoreGateway {
  list(companyId: string, regime?: string): Promise<ComplianceCertificate[]>;
  get(companyId: string, id: string): Promise<ComplianceCertificate | null>;
  upsert(cert: Omit<ComplianceCertificate, 'id'> & { id?: string }): Promise<ComplianceCertificate>;
  setStatus(companyId: string, id: string, status: CertificateStatus): Promise<void>;
}

const MS_PER_DAY = 86_400_000;

// ── Expiry monitoring ──────────────────────────────────────────────────────
/** Whole days until `notAfter` (negative = already expired); null if no expiry. Pure. */
export function daysUntilExpiry(cert: ComplianceCertificate, now: Date): number | null {
  if (!cert.notAfter) return null;
  return Math.floor((Date.parse(cert.notAfter) - now.getTime()) / MS_PER_DAY);
}

/** True when the certificate is past its validity end. Pure. */
export function isExpired(cert: ComplianceCertificate, now: Date): boolean {
  return cert.notAfter ? Date.parse(cert.notAfter) < now.getTime() : false;
}

/** Active certs expiring within `days` (inclusive), soonest first. Pure. */
export function certificatesExpiringWithin(
  certs: readonly ComplianceCertificate[],
  days: number,
  now: Date,
): ComplianceCertificate[] {
  return certs
    .filter((c) => c.status === 'active')
    .map((c) => ({ c, d: daysUntilExpiry(c, now) }))
    .filter((x) => x.d !== null && x.d <= days)
    .sort((a, b) => (a.d! - b.d!))
    .map((x) => x.c);
}

// ── Rotation ──────────────────────────────────────────────────────────────
export interface RotationPlan {
  rotate: boolean;
  reason: 'expired' | 'expiring_soon' | 'revoked' | 'ok';
  daysLeft: number | null;
}

/** Decide whether a cert needs rotation ahead of `thresholdDays`. Pure. */
export function planRotation(
  cert: ComplianceCertificate,
  now: Date,
  thresholdDays = 30,
): RotationPlan {
  const daysLeft = daysUntilExpiry(cert, now);
  if (cert.status === 'revoked') return { rotate: true, reason: 'revoked', daysLeft };
  if (isExpired(cert, now)) return { rotate: true, reason: 'expired', daysLeft };
  if (daysLeft !== null && daysLeft <= thresholdDays) return { rotate: true, reason: 'expiring_soon', daysLeft };
  return { rotate: false, reason: 'ok', daysLeft };
}

// ── Signature provider interface (PAUSED) ──────────────────────────────────
export interface SignedPayload {
  signedXml: string;
  signatureValue: string;
  certificateRef: string;
}

/**
 * Signs a canonical document with a stored certificate. The real implementation
 * (ECDSA/CSID against KMS-held material) is PAUSED — implementations stub `sign`
 * to throw PausedSignatureError until certificates + credentials exist.
 */
export interface SignatureProvider {
  regime: string;
  sign(canonicalXml: string, cert: ComplianceCertificate): Promise<SignedPayload>;
}

export class PausedSignatureError extends Error {
  constructor(public readonly regime: string) {
    super(`signature provider for "${regime}" is paused — no certificate material/credentials configured`);
    this.name = 'PausedSignatureError';
  }
}

/** A signature provider whose `sign` always throws (the paused default). */
export function createPausedSignatureProvider(regime: string): SignatureProvider {
  return { regime, async sign(): Promise<SignedPayload> { throw new PausedSignatureError(regime); } };
}

/** Registry of signature providers per regime (paused defaults registered up-front). */
export class CertificateRegistry {
  private providers = new Map<string, SignatureProvider>();
  register(p: SignatureProvider): void { this.providers.set(p.regime, p); }
  get(regime: string): SignatureProvider { return this.providers.get(regime) ?? createPausedSignatureProvider(regime); }
  list(): readonly SignatureProvider[] { return [...this.providers.values()]; }
}

/** Shared registry; regimes default to the paused signer until activated. */
export const certificateRegistry = new CertificateRegistry();
