/**
 * VANTORA — Feature Configuration catalog (tenant-configurable capabilities).
 *
 * A generic, reusable flag system: every high-level capability that should be
 * switchable per tenant is declared here once, tagged by `pack` (industry) and
 * `domain`. The pharmacy pack is the first consumer, but the table, resolver,
 * templates and the Company-Settings screen are industry-agnostic — a new
 * vertical just adds its features here with a new `pack`.
 *
 * Flags gate four things (see `coverage`): NAV visibility, SCREEN/UI visibility,
 * VALIDATION rules, and BUSINESS logic. Disabled features must not appear.
 *
 * Templates (Lite / Standard / Enterprise) are the starting points for a new
 * tenant; `templates` lists which presets enable each feature. A tenant with no
 * stored config resolves to the Lite preset (safe minimum).
 */

export type FeatureDomain = 'inventory' | 'pos' | 'governance';
export type FeatureTemplate = 'lite' | 'standard' | 'enterprise';

/** Where a feature manifests — drives the UI Coverage Audit. */
export interface FeatureCoverage {
  /** nav item label keys gated by this feature. */
  nav?: string[];
  /** screen routes whose UI this feature shows/hides. */
  screens?: string[];
  /** validation rules keyed by this feature. */
  validation?: string[];
  /** server/business-logic gated by this feature. */
  logic?: string[];
}

export interface FeatureDef {
  key: string;
  pack: string;          // industry pack, e.g. 'pharmacy' (reusable beyond pharmacy)
  domain: FeatureDomain;
  labelKey: string;      // i18n: features.label.<key>
  descKey: string;       // i18n: features.desc.<key>
  templates: FeatureTemplate[];
  coverage: FeatureCoverage;
}

const F = (
  key: string, domain: FeatureDomain, templates: FeatureTemplate[], coverage: FeatureCoverage,
): FeatureDef => ({
  key, pack: 'pharmacy', domain,
  labelKey: `features.label.${key}`, descKey: `features.desc.${key}`,
  templates, coverage,
});

const ALL: FeatureTemplate[] = ['lite', 'standard', 'enterprise'];
const STD: FeatureTemplate[] = ['standard', 'enterprise'];
const ENT: FeatureTemplate[] = ['enterprise'];

export const FEATURES: FeatureDef[] = [
  // ── Inventory ──────────────────────────────────────────────────────────────
  F('pharmacy.batch_tracking', 'inventory', STD, {
    screens: ['/inventory/batches', '/pharmacy/receive'], logic: ['erp_product_batches'],
    nav: ['nav.items.pharmacyBatches'],
  }),
  F('pharmacy.lot_tracking', 'inventory', ENT, {
    screens: ['/inventory/batches'], validation: ['lot_required'],
  }),
  F('pharmacy.expiry_tracking', 'inventory', ALL, {
    screens: ['/pharmacy/receive', '/inventory/batches'], validation: ['expiry_required'],
    logic: ['batch.expiry_date'],
  }),
  F('pharmacy.fefo_allocation', 'inventory', STD, {
    logic: ['erp_pick_fefo_batches'], screens: ['/pharmacy/pos'],
  }),
  F('pharmacy.near_expiry_alerts', 'inventory', ALL, {
    nav: ['nav.items.pharmacyExpiry'], screens: ['/pharmacy/expiry'], logic: ['erp_expiry_risk'],
  }),
  F('pharmacy.expiry_risk_dashboard', 'inventory', STD, {
    nav: ['nav.items.pharmacyExpiry'], screens: ['/pharmacy/expiry'],
  }),
  F('pharmacy.expiry_writeoff_workflow', 'inventory', STD, {
    screens: ['/pharmacy/expiry'], logic: ['expiry.writeOff'], nav: ['nav.items.pharmacyWriteoff'],
  }),
  F('pharmacy.barcode_required', 'inventory', STD, {
    validation: ['barcode_required'], screens: ['/products'],
  }),
  F('pharmacy.multi_unit_support', 'inventory', STD, {
    screens: ['/products'], logic: ['product.uoms'],
  }),
  F('pharmacy.controlled_drug_tracking', 'inventory', ENT, {
    screens: ['/pharmacy/dispense'], validation: ['controlled_log'], logic: ['dispense.is_controlled'],
  }),
  // ── POS ────────────────────────────────────────────────────────────────────
  F('pharmacy.pos_barcode_scan', 'pos', ALL, {
    screens: ['/pharmacy/pos'], logic: ['pos.barcodeSearch'],
  }),
  F('pharmacy.pos_hold_resume', 'pos', STD, {
    screens: ['/pharmacy/pos'], logic: ['pos.hold'],
  }),
  F('pharmacy.pos_returns', 'pos', ALL, {
    screens: ['/pharmacy/pos', '/sales/returns'], logic: ['returns'],
  }),
  F('pharmacy.pos_discount_approval', 'pos', STD, {
    screens: ['/pharmacy/pos'], validation: ['discount_approval'],
  }),
  F('pharmacy.pos_price_override', 'pos', ENT, {
    screens: ['/pharmacy/pos'], validation: ['price_override'], logic: ['pricing.listModify'],
  }),
  F('pharmacy.pos_prescription_required', 'pos', ENT, {
    screens: ['/pharmacy/pos'], validation: ['prescription_required'],
  }),
  F('pharmacy.pos_receipt_printing', 'pos', ALL, {
    screens: ['/sales/pos', '/pharmacy/pos'], logic: ['receipt_print'],
  }),
  // ── Governance ───────────────────────────────────────────────────────────────
  F('pharmacy.approval_workflows', 'governance', STD, {
    logic: ['erp_workflow_start'], nav: ['nav.items.approvals'],
  }),
  F('pharmacy.audit_logging', 'governance', ALL, {
    logic: ['erp_log_audit'], nav: ['nav.items.tenantAudit'],
  }),
  F('pharmacy.critical_actions', 'governance', ALL, {
    logic: ['useCriticalAction'], screens: ['/settings/action-policies'],
  }),
  F('pharmacy.notifications', 'governance', ALL, {
    logic: ['erp_notify'],
  }),
];

export const FEATURES_BY_KEY: Record<string, FeatureDef> =
  Object.fromEntries(FEATURES.map((f) => [f.key, f]));

export const FEATURE_TEMPLATES: FeatureTemplate[] = ['lite', 'standard', 'enterprise'];

/** The set of feature keys a template enables. */
export function templateFeatureKeys(template: FeatureTemplate): string[] {
  return FEATURES.filter((f) => f.templates.includes(template)).map((f) => f.key);
}

/** Default (no stored config) = the Lite preset — the safe minimum. */
export function defaultEnabled(key: string): boolean {
  return FEATURES_BY_KEY[key]?.templates.includes('lite') ?? false;
}

/** Features for a given pack (industry), e.g. 'pharmacy'. */
export function featuresForPack(pack: string): FeatureDef[] {
  return FEATURES.filter((f) => f.pack === pack);
}
