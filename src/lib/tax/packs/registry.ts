// ============================================================================
// Global Tax — Country Pack framework foundation (Phase 5A · M6). Pure, no DB.
// The provider interface + registry that lets tax compliance be enabled per
// country through packs (proposal §2), selected per company by country + regime.
// This is the FOUNDATION only — real packs (Egypt ETA, Saudi ZATCA, …) register
// against this in 5C+. Capability negotiation lets the orchestrator degrade
// gracefully and never call an unsupported capability. Versioned per §2.1.
// ============================================================================

import type { ComplianceClass } from '../profiles';

export type PackCapability =
  | 'e_invoice' | 'e_receipt' | 'simplified'
  | 'clearance' | 'reporting'
  | 'credit_note' | 'debit_note'
  | 'qr' | 'digital_signature';

/** A country compliance pack: declares what it can do; behaviour (serialize/sign/
 *  submit/poll/validate/report) is implemented by the real pack in 5C+. */
export interface TaxCompliancePack {
  id: string;
  country: string;          // ISO country (e.g. 'SA', 'EG', 'AE')
  regime: string;          // e.g. 'zatca', 'eta', 'fta'
  version: string;         // semver (§2.1 versioning); highest wins on resolve
  capabilities: readonly PackCapability[];
  /** Optional effective date for this version (authority mandate date). */
  effectiveFrom?: string | null;
}

/** Compare two semver strings (major.minor.patch). Returns >0 if a>b. */
function semverCompare(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Registry of country compliance packs. Multiple versions per country+regime may
 *  be registered side-by-side (§2.1); resolution picks the applicable version. */
export class TaxPackRegistry {
  private packs: TaxCompliancePack[] = [];

  register(pack: TaxCompliancePack): void {
    this.packs.push(pack);
  }

  list(): readonly TaxCompliancePack[] {
    return this.packs;
  }

  /** Resolve the pack for a country+regime, as-of a date — highest applicable
   *  version whose effectiveFrom is on/before `asOf` (or undated). */
  resolve(country: string, regime: string, asOf?: string): TaxCompliancePack | undefined {
    return this.packs
      .filter((p) => p.country === country && p.regime === regime)
      .filter((p) => !asOf || !p.effectiveFrom || p.effectiveFrom <= asOf)
      .sort((a, b) => semverCompare(b.version, a.version))[0];
  }
}

/** Map a document profile's compliance class to the pack capability it needs. */
export function capabilityForComplianceClass(cls: ComplianceClass): PackCapability | null {
  switch (cls) {
    case 'e_invoice': return 'e_invoice';
    case 'e_receipt': return 'e_receipt';
    case 'simplified': return 'simplified';
    case 'none': return null;
  }
}

/** Does the pack advertise a capability? */
export function packSupports(pack: TaxCompliancePack, cap: PackCapability): boolean {
  return pack.capabilities.includes(cap);
}

/** Can the pack handle a document of this compliance class? (none = always ok). */
export function canHandleComplianceClass(pack: TaxCompliancePack, cls: ComplianceClass): boolean {
  const cap = capabilityForComplianceClass(cls);
  return cap == null || packSupports(pack, cap);
}

/** Process-wide default registry (real packs register here in 5C+). */
export const taxPackRegistry = new TaxPackRegistry();
