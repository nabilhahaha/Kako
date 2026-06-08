// ============================================================================
// E-Invoicing Compliance — country catalog (Phase 5G). Pure data describing every
// country's compliance regime + the platform's support level. The architecture
// adds future countries here (+ a provider adapter) with NO schema or platform
// redesign. `live_paused` = built but authority connectors paused (no creds);
// `prepared` = reference-readiness adapter/types in place; `planned` = catalogued
// for a future pack. Country logic lives here + in adapters, never in invoice
// entities.
// ============================================================================

export type CountrySupport =
  | 'live_paused'  // implemented; authority submission PAUSED pending credentials
  | 'prepared'     // reference-readiness adapter + types (no submission)
  | 'planned';     // catalogued for a future pack

export interface CountryComplianceEntry {
  country: string;   // ISO-3166 alpha-2
  name: string;
  regime: string;    // 'zatca' | 'eta' | 'fta' | 'pint-ae' | 'jofotara' | 'peppol' | ...
  format: string;    // 'ubl-xml' | 'json' | 'peppol-bis-3' | ...
  support: CountrySupport;
  notes?: string;
}

/** The platform's compliance support matrix (additive — append future packs). */
export const COUNTRY_COMPLIANCE_CATALOG: readonly CountryComplianceEntry[] = [
  { country: 'SA', name: 'Saudi Arabia', regime: 'zatca', format: 'ubl-xml', support: 'live_paused', notes: 'CSID/OTP/clearance/reporting paused' },
  { country: 'EG', name: 'Egypt', regime: 'eta', format: 'json', support: 'live_paused', notes: 'ETA submission paused' },
  { country: 'AE', name: 'United Arab Emirates', regime: 'fta', format: 'json', support: 'live_paused', notes: 'FTA VAT reporting paused' },
  { country: 'AE', name: 'United Arab Emirates', regime: 'pint-ae', format: 'peppol-bis-3', support: 'prepared', notes: 'PINT-AE / PEPPOL AS4 via ASP — reference readiness' },
  { country: 'JO', name: 'Jordan', regime: 'jofotara', format: 'json', support: 'prepared', notes: 'JoFotara national e-invoicing — reference readiness' },
  { country: 'BH', name: 'Bahrain', regime: 'nbr', format: 'ubl-xml', support: 'planned' },
  { country: 'QA', name: 'Qatar', regime: 'qatar', format: 'ubl-xml', support: 'planned' },
  { country: 'OM', name: 'Oman', regime: 'ota', format: 'ubl-xml', support: 'planned' },
  { country: 'KW', name: 'Kuwait', regime: 'kuwait', format: 'ubl-xml', support: 'planned' },
  { country: 'MA', name: 'Morocco', regime: 'dgi', format: 'xml', support: 'planned' },
  { country: 'TR', name: 'Türkiye', regime: 'gib', format: 'ubl-tr', support: 'planned' },
  { country: 'EU', name: 'EU PEPPOL', regime: 'peppol', format: 'peppol-bis-3', support: 'planned' },
  { country: 'GB', name: 'United Kingdom', regime: 'hmrc', format: 'peppol-bis-3', support: 'planned' },
  { country: 'IN', name: 'India', regime: 'gst-irp', format: 'json', support: 'planned' },
];

/** Look up a catalog entry by country (+ optional regime). Pure. */
export function getCountryEntry(country: string, regime?: string): CountryComplianceEntry | undefined {
  return COUNTRY_COMPLIANCE_CATALOG.find((e) => e.country === country && (regime ? e.regime === regime : true));
}

/** All catalog entries at a given support level. Pure. */
export function countriesBySupport(support: CountrySupport): readonly CountryComplianceEntry[] {
  return COUNTRY_COMPLIANCE_CATALOG.filter((e) => e.support === support);
}
