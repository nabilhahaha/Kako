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
