// ============================================================================
// E-Invoicing Compliance — country-agnostic provider abstraction + registry
// (Phase 5F). One interface every authority regime implements (ZATCA, ETA, FTA,
// …). The OFFLINE-capable surface — validate / buildDocument / buildQr — is
// implemented now (reusing the Phase-5 packs). The authority SEND (`submit`)
// is deliberately PAUSED: providers either omit it or throw PausedConnectorError
// until certificates, CSID onboarding, and credentials exist. Activating a
// regime later becomes connector work, not a platform redesign.
// ============================================================================

export interface ComplianceValidationIssue {
  field: string;
  message: string;
}

/** Normalized, regime-tagged document envelope produced offline. */
export interface EInvoiceDocument {
  country: string;
  regime: string;
  /** Wire format of `content` (e.g. 'json' for ETA, 'ubl-xml' for ZATCA). */
  format: string;
  /** Regime-specific normalized payload (structure owned by the pack). */
  content: unknown;
  /** Base64 QR payload when the regime defines one. */
  qr?: string;
  /** Monetary totals when the builder exposes them. */
  totals?: { net?: number; tax?: number; total?: number };
}

/** Thrown by any authority-touching call while connectors are paused. */
export class PausedConnectorError extends Error {
  constructor(public readonly regime: string) {
    super(`authority connector for "${regime}" is paused — no certificates/credentials configured`);
    this.name = 'PausedConnectorError';
  }
}

/**
 * Country-agnostic e-invoicing provider. `TInput` is the regime's native invoice
 * input (e.g. ZatcaInvoiceInput). The offline surface is real; `submit` is the
 * paused authority boundary.
 */
export interface EInvoiceProvider<TInput = unknown> {
  id: string;
  country: string;        // ISO-3166 alpha-2
  regime: string;         // 'zatca' | 'eta' | 'fta' | …
  version: string;        // semver
  capabilities: readonly string[];
  /** Pure offline validation. */
  validate(input: TInput): ComplianceValidationIssue[];
  /** Pure offline document build (normalized envelope). */
  buildDocument(input: TInput): EInvoiceDocument;
  /** Pure offline QR build, when the regime defines one. */
  buildQr?(input: TInput): string | undefined;
  /**
   * Authority submission — PAUSED. Optional so providers can simply omit it;
   * implementations that stub it MUST throw PausedConnectorError until activated.
   */
  submit?(input: TInput): Promise<never>;
}

/** Process-wide registry resolving providers by country+regime. */
export class ComplianceProviderRegistry {
  private providers: EInvoiceProvider[] = [];

  register(p: EInvoiceProvider): void {
    const i = this.providers.findIndex((x) => x.country === p.country && x.regime === p.regime);
    if (i >= 0) this.providers[i] = p;
    else this.providers.push(p);
  }

  get(country: string, regime: string): EInvoiceProvider | undefined {
    return this.providers.find((p) => p.country === country && p.regime === regime);
  }

  byCountry(country: string): readonly EInvoiceProvider[] {
    return this.providers.filter((p) => p.country === country);
  }

  list(): readonly EInvoiceProvider[] {
    return [...this.providers];
  }
}

/** Shared default registry (providers self-register on import). */
export const complianceProviderRegistry = new ComplianceProviderRegistry();
