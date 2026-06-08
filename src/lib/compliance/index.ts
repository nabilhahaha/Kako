// ============================================================================
// E-Invoicing Compliance Platform (Phase 5F) — public surface. Country-agnostic,
// additive, flag-gated (KAKO_EINVOICE, default OFF). Provides the reusable
// foundations — lifecycle, hash chain, retry/DLQ queue, certificate store,
// health model, provider abstraction — onto which the PAUSED authority
// connectors (ZATCA/ETA/FTA) land later as pure connector work. No live
// authority calls, CSID onboarding, certificate issuance, or OTP here.
// ============================================================================

export * from './flags';
export * from './lifecycle';
export * from './hash';
export * from './queue';
export * from './certificate-store';
export * from './health';
export * from './provider';
export * from './document';

export { zatcaProvider } from './providers/zatca';
export { etaProvider } from './providers/eta';
export { uaeProvider } from './providers/uae';

import { complianceProviderRegistry, type ComplianceProviderRegistry } from './provider';
import { zatcaProvider } from './providers/zatca';
import { etaProvider } from './providers/eta';
import { uaeProvider } from './providers/uae';

/** All built-in compliance providers (offline surface live; submit paused). */
export const ALL_COMPLIANCE_PROVIDERS = [zatcaProvider, etaProvider, uaeProvider] as const;

/** Register the built-in providers with a registry. */
export function registerComplianceProviders(reg: ComplianceProviderRegistry): void {
  for (const p of ALL_COMPLIANCE_PROVIDERS) reg.register(p);
}

// Self-register into the shared default registry on import.
registerComplianceProviders(complianceProviderRegistry);
