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

export type FeatureDomain = 'inventory' | 'pos' | 'governance' | 'scanning' | 'contacts';
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

/** Platform-pack feature (reusable across ALL industry packs, e.g. scanning). */
const P = (
  key: string, domain: FeatureDomain, templates: FeatureTemplate[], coverage: FeatureCoverage,
): FeatureDef => ({
  key, pack: 'platform', domain,
  labelKey: `features.label.${key}`, descKey: `features.desc.${key}`,
  templates, coverage,
});

const ALL: FeatureTemplate[] = ['lite', 'standard', 'enterprise'];
const STD: FeatureTemplate[] = ['standard', 'enterprise'];
const ENT: FeatureTemplate[] = ['enterprise'];

/**
 * Pharmacy packs (the three onboarding templates). Powerful backend, simple
 * frontend — a tenant on Lite only ever SEES Lite features (nav, screens, logic
 * are all flag-gated), so a small pharmacy is never overwhelmed. Tiers are
 * monotonic (Lite ⊆ Standard ⊆ Enterprise):
 *
 *   • Lite       — POS, search, alternatives, receipt print, simple stock
 *                  receiving (batch tracking), expiry alerts.
 *   • Standard   — + FEFO, reorder + purchase orders, reports (expiry-risk
 *                  dashboard), offline POS, hold/resume, multi-unit, prescription
 *                  capture, expiry write-off.
 *   • Enterprise — + controlled drugs, inventory valuation, advanced approvals,
 *                  lot tracking, price override, mandatory prescription
 *                  (+ multi-branch when that pack lands). Audit logging /
 *                  critical-action governance underpins every tier.
 */
export const FEATURES: FeatureDef[] = [
  // ── Inventory ──────────────────────────────────────────────────────────────
  // Lite: simple stock receiving + expiry alerts need batches with expiry, so
  // batch tracking is part of the Lite baseline (see the Pharmacy templates).
  F('pharmacy.batch_tracking', 'inventory', ALL, {
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
  // Standard tier (FEFO is a Standard capability per the Pharmacy templates).
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
    screens: ['/products', '/pharmacy/onboarding', '/pharmacy/receive', '/pharmacy/pos', '/inventory', '/pharmacy/reports'],
    validation: ['sell_mode', 'allow_fractional', 'unit_conversion'],
    logic: ['product.uoms', 'uom.engine', 'uom.rules', 'base_unit_movements'],
  }),
  F('pharmacy.controlled_drug_tracking', 'inventory', ENT, {
    screens: ['/pharmacy/dispense'], validation: ['controlled_log'], logic: ['dispense.is_controlled'],
  }),
  F('pharmacy.purchase_orders', 'inventory', STD, {
    nav: ['nav.items.pharmacyPurchasing'], screens: ['/pharmacy/purchasing'],
    logic: ['erp_pharmacy_reorder_suggestions', 'erp_receive_purchase_order'],
  }),
  F('pharmacy.inventory_valuation', 'inventory', ENT, {
    nav: ['nav.items.pharmacyValuation'], screens: ['/pharmacy/valuation'],
    logic: ['erp_pharmacy_inventory_valuation'],
  }),
  F('pharmacy.multi_branch', 'inventory', ENT, {
    nav: ['nav.items.pharmacyBranches'], screens: ['/pharmacy/branches'],
    logic: ['erp_pharmacy_branch_stock', 'erp_complete_transfer'],
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
  F('pharmacy.batch_aware_returns', 'pos', STD, {
    nav: ['nav.items.pharmacyReturns'], screens: ['/pharmacy/returns'],
    logic: ['erp_pharmacy_return_restock_batches'],
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
  F('pharmacy.prescription_capture', 'pos', STD, {
    screens: ['/pharmacy/pos', '/pharmacy/dispense'],
    logic: ['erp_pharmacy_dispenses', 'prescription_dispense_link'],
  }),
  F('pharmacy.pos_receipt_printing', 'pos', ALL, {
    screens: ['/sales/pos', '/pharmacy/pos'], logic: ['receipt_print'],
  }),
  F('pharmacy.substitute_suggestions', 'pos', ALL, {
    screens: ['/pharmacy/pos'], logic: ['erp_pharmacy_alternatives'],
  }),
  F('pharmacy.offline_pos', 'pos', STD, {
    screens: ['/pharmacy/pos'], logic: ['offline_queue', 'erp_pharmacy_pos_idempotency'],
  }),
  F('pharmacy.customer_credit', 'pos', STD, {
    screens: ['/pharmacy/pos'], validation: ['credit_limit'], logic: ['partial_payment', 'customer_credit'],
  }),
  F('pharmacy.loyalty', 'pos', ENT, {
    nav: ['nav.items.pharmacyLoyalty'], screens: ['/pharmacy/pos', '/pharmacy/loyalty'],
    logic: ['erp_loyalty_redeem_earn'],
  }),
  // ── Governance ───────────────────────────────────────────────────────────────
  // Enterprise: "advanced approvals" per the Pharmacy templates.
  F('pharmacy.approval_workflows', 'governance', ENT, {
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
  F('pharmacy.eta_einvoicing', 'governance', ENT, {
    nav: ['nav.items.pharmacyEta'], screens: ['/pharmacy/eta', '/settings/einvoice'],
    logic: ['erp_company_eta_settings'],
  }),
  // ── Scanning (PLATFORM pack — reusable by every industry; surfaced only where a
  //    business process consumes it: Pharmacy POS, FMCG sales, warehouse, …) ────
  P('platform.multi_uom', 'inventory', STD, {
    screens: ['/settings/uom', '/products', '/inventory'],
    validation: ['sell_mode', 'allow_fractional', 'unit_conversion'],
    logic: ['product.uoms', 'uom.engine', 'uom.rules', 'base_unit_movements'],
    nav: ['nav.items.unitsOfMeasure'],
  }),
  // Collection-in-Sell (FMCG): take payment inside the Van-Sell flow before the
  // invoice is issued. Default OFF (no template seeds it) — opt-in per tenant
  // until pilot UAT validates it; additive and reversible (the standalone
  // Collect screen and erp_van_sell are untouched).
  P('platform.collect_in_sell', 'pos', [], {
    screens: ['/field/van-sales/sell'],
    logic: ['erp_van_sell_with_payment', 'collection.posting'],
  }),
  // Visit-Driven Route (FMCG): the route stop opens the customer visit context
  // (Statement → Collect/Sell/Return/Print → Complete Visit → Next). Default OFF
  // (opt-in per tenant); UI/navigation only — no engine/schema/transaction change.
  P('platform.visit_driven_route', 'pos', [], {
    screens: ['/field/journey', '/field/van-sales/statement'],
    logic: ['visit.session', 'route.visit_context'],
  }),
  // Day Reopen (FMCG): after End Day & Settle, the salesman may submit a
  // reason-based request to reopen the closed day; a Supervisor/Admin approves or
  // rejects it. Default OFF (opt-in per tenant). Governed + audited; no engine.
  P('platform.day_reopen', 'pos', [], {
    screens: ['/field/van-sales/sell', '/field/van-sales/reopen-approvals'],
    logic: ['erp_request_day_reopen', 'erp_decide_day_reopen'],
  }),
  // Unified salesman workspace (FMCG): Today becomes the ONE operational home for
  // the van salesman — day status + single CTA, route-first entry, the operational
  // tiles, reopen, and signals — and /field/van-sales redirects into it. Default
  // OFF (opt-in per tenant); UI/navigation composition only — no engine/schema.
  P('platform.unified_salesman_workspace', 'pos', [], {
    screens: ['/today', '/field/van-sales'],
    logic: ['salesman.workspace', 'today.compose'],
  }),
  // Salesman Requests hub (FMCG): one place for the salesman's operational
  // requests (Load · Cash handover · Reopen day; more later). Adds the Requests
  // bottom-nav tab. Default OFF; independently rollable from the workspace.
  P('platform.salesman_requests', 'pos', [], {
    screens: ['/field/van-sales/requests'],
    logic: ['requests.hub', 'erp_request_cash_handover'],
  }),
  // Smart Next Customer (FMCG): after Complete Visit / at Start Day, suggest the
  // next route stops ranked route-first (sequence primary, distance secondary)
  // with Start Visit + external Navigate (Google/Apple/Waze), plus Resume Visit.
  // Default OFF (opt-in per tenant); UI/navigation + a pure ranking engine — no
  // engine/schema/transaction change.
  P('platform.smart_next_customer', 'pos', [], {
    screens: ['/field/next', '/field/journey', '/today'],
    logic: ['next-customer.rank', 'map-links', 'active-visit'],
  }),
  // RPC authorization enforcement (Security — Backend-Enforcement Phase D):
  // defense-in-depth in-function permission checks on sensitive financial /
  // transactional RPCs (issue invoice, record payment, post voucher, approve
  // load, van sell/collect/return). Default OFF — when ON for a tenant, each
  // guarded RPC also verifies the caller's permission server-side (not only the
  // UI/route). Reversible by toggling the flag; no schema change.
  P('platform.rpc_authz_enforcement', 'governance', [], {
    logic: ['erp_guard_rpc', 'erp_rpc_authz_enabled'],
  }),
  // Server-action permission enforcement (Security — Backend-Enforcement Phase F):
  // defense-in-depth permission checks inside mutating server actions that
  // previously relied on UI hiding + RLS (inventory transfers/counts, stock
  // requests, product create/edit/category, customer create/edit/import/journey/
  // status). Default OFF — when ON for a tenant, each action also verifies the
  // caller's permission server-side. Reversible by toggling the flag; no schema.
  P('platform.action_authz_enforcement', 'governance', [], {
    logic: ['requireActionPerm', 'actionAuthzEnforced'],
  }),
  // Credit-block override (FMCG): when ON, authorized roles (customers.change_status)
  // may bypass the credit block on the visit cockpit to create a CASH sale for an
  // overdue / over-limit customer. Default OFF — the block is enforced unless the
  // company policy explicitly allows the override.
  P('platform.credit_override', 'governance', [], {
    logic: ['creditOverrideEnabled', 'visit.credit_block'],
  }),
  // Share-as-PDF (FMCG): when ON, the Share action on a completed sale / collection /
  // return generates the document PDF (server-rendered from the existing print view,
  // identical layout) and opens the native share sheet with the file. Default OFF —
  // when OFF the Share action keeps its current text-share behavior.
  P('platform.share_pdf', 'pos', [], {
    logic: ['sharePdfEnabled'], screens: ['/api/pdf'],
  }),
  // Daily Summary (FMCG, Phase 1): read-only "ملخص اليوم" — salesman day status +
  // exact counts/amounts (live while open, final when closed) and a supervisor
  // per-salesman KPI + ranking view. Built from existing data only; estimated
  // (gap-based) metrics are labeled تقديري. Default OFF.
  P('platform.daily_summary', 'pos', [], {
    logic: ['dailySummaryEnabled'], screens: ['/field/van-sales/summary', '/distribution/daily-summary'],
  }),
  P('platform.scan_barcode', 'scanning', ALL, {
    logic: ['scan.barcode'], screens: ['/pharmacy/pos', '/sales/pos'],
  }),
  P('platform.scan_camera', 'scanning', STD, {
    logic: ['scan.camera'], screens: ['/pharmacy/pos'],
  }),
  P('platform.scan_qr', 'scanning', STD, {
    logic: ['scan.qr'], screens: ['/pharmacy/pos'],
  }),
  P('platform.scan_ocr', 'scanning', ENT, {
    logic: ['scan.ocr'],
  }),
  // ── Contacts (PLATFORM pack — reusable customer/contact model) ──────────────
  P('platform.lightweight_customer_mode', 'contacts', ALL, {
    logic: ['contact.lightweight'], screens: ['/pharmacy/pos', '/sales/pos', '/customers'],
    validation: ['contact_mode'],
  }),
  P('platform.quick_customer_create', 'contacts', ALL, {
    logic: ['quickCreateCustomer'], screens: ['/pharmacy/pos', '/sales/pos'],
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
