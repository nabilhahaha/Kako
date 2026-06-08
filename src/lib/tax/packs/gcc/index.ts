// ============================================================================
// Global Tax — GCC pack descriptors + registration (Phase 5E). UAE FTA (with a
// builder/validation, uae-fta.ts) plus Bahrain NBR, Oman OTA, and Kuwait readiness
// descriptors. Each registers against the M6 registry; all flag-gated per country
// (KAKO_TAX_AE/_BH/_OM/_KW). VAT reporting connectors land per country when needed.
// ============================================================================

import type { TaxCompliancePack, TaxPackRegistry } from '../registry';
import { UAE_FTA_PACK } from './uae-fta';

export { UAE_FTA_PACK, buildFtaInvoice, validateFtaInvoice } from './uae-fta';

/** Bahrain NBR VAT (reporting). */
export const BAHRAIN_NBR_PACK: TaxCompliancePack = {
  id: 'nbr-1.0', country: 'BH', regime: 'nbr', version: '1.0.0',
  capabilities: ['e_invoice', 'reporting'],
};

/** Oman OTA VAT (reporting). */
export const OMAN_OTA_PACK: TaxCompliancePack = {
  id: 'ota-1.0', country: 'OM', regime: 'ota', version: '1.0.0',
  capabilities: ['e_invoice', 'reporting'],
};

/** Kuwait — future tax readiness scaffold (no VAT regime mandated yet). */
export const KUWAIT_PACK: TaxCompliancePack = {
  id: 'kw-0.1', country: 'KW', regime: 'kw', version: '0.1.0',
  capabilities: [],
};

export const GCC_PACKS: readonly TaxCompliancePack[] = [UAE_FTA_PACK, BAHRAIN_NBR_PACK, OMAN_OTA_PACK, KUWAIT_PACK];

/** Register all GCC packs with a registry (real connectors activate per flag). */
export function registerGccPacks(registry: TaxPackRegistry): void {
  for (const p of GCC_PACKS) registry.register(p);
}
