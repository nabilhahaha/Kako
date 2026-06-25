import type { Permission } from '@/lib/erp/permissions';
import { isModuleGateOpen, STANDALONE_PACK_MODULES, type Module } from '@/lib/erp/navigation';
import { Home, Users, Zap, Boxes, MapPin, ScanBarcode, ClipboardCheck, ClipboardList, FileText, BarChart3, Truck, Inbox, Route, type LucideIcon } from 'lucide-react';

/** A candidate bottom-nav tab. `href` must resolve to a real route, `labelKey`
 *  is an i18n key, `perm` (when set) gates visibility, and `module` (when set)
 *  requires that feature module be enabled for the company. Kept in this pure
 *  (no-JSX) module so the dead-link / mis-routed-tab class of bug is
 *  regression-guarded by a unit test rather than only caught in the browser. */
export interface BottomNavTab {
  href: string;
  icon: LucideIcon;
  labelKey: string;
  /** Required permission; omit for always-visible (home). */
  perm?: Permission;
  /** Feature module that must be enabled (when the modules list is known). Omit =
   *  no module restriction. Lets a tab route to the right vertical (e.g. the
   *  Fashion POS) instead of a module the company isn't entitled to. */
  module?: Module;
  /** Mutually-exclusive group: only ONE tab per group is ever rendered (the most
   *  specific route for the company's business type), so a shop never sees two
   *  tabs for the same job — e.g. the "Sell" tab is generic Sales OR Fashion POS,
   *  never both. */
  group?: string;
  /** Only a candidate when Van Sales is active for the tenant (env GA + the
   *  per-company toggle). Lets the "Sell" tab route a van rep to the Van-Sell
   *  workflow instead of the generic invoice editor. */
  vanSalesOnly?: boolean;
  /** Only a candidate when the unified salesman workspace is active for THIS user
   *  (flag ON + van salesman). Used to surface the Customer-first entry. */
  unifiedOnly?: boolean;
  /** Only a candidate when the Salesman Requests hub is active for THIS user
   *  (platform.salesman_requests ON + van salesman). */
  requestsOnly?: boolean;
  /** Suppressed when the unified salesman workspace is active for THIS user — the
   *  duplicate/overlapping entry points (generic Home, the standalone Sell tab)
   *  are removed so Today is the one home and selling stays Customer-first. */
  hideWhenUnified?: boolean;
}

/** Ordered candidate tabs for the mobile bottom bar. The Stock view lives at
 *  `/inventory` (the catalog is `/products`); the inventory tab must point there.
 *  Only the first 4 the user can see are rendered, plus a "More" drawer trigger. */
export const BOTTOM_NAV_TABS: BottomNavTab[] = [
  // ── Field Verification (standalone pack) ──
  // Listed first so a Field-Verification-Only tenant's mobile bar reads
  // Nearby · Setup · Reports · More (mirroring the sidebar pack section). Each is
  // module-gated to `field_verification`, so it appears only when that module is
  // enabled; for a pack-only tenant the generic operational tabs below are
  // suppressed (see resolveBottomNavTabs). Hrefs reuse the existing FV pages.
  { href: '/field-verification/my-customers', icon: MapPin, labelKey: 'nav.bottom.fvCustomers', perm: 'field_verification.verify', module: 'field_verification' },
  { href: '/field-verification/setup', icon: ClipboardCheck, labelKey: 'nav.bottom.fvSetup', perm: 'field_verification.admin', module: 'field_verification' },
  { href: '/field-verification/reports', icon: BarChart3, labelKey: 'nav.bottom.fvReports', perm: 'field_verification.reports', module: 'field_verification' },
  // ── Multi-Form Field Work (custom forms on top of FV) — same module gate, so they
  //    surface in the pack-only mobile bar. forms.* are seeded to the FV roles (0383), so
  //    admin sees Forms Library, reps see My Forms, supervisors/viewers see Forms Reports.
  { href: '/field-verification/forms', icon: FileText, labelKey: 'nav.bottom.fvForms', perm: 'forms.admin', module: 'field_verification' },
  { href: '/field-verification/my-forms', icon: ClipboardList, labelKey: 'nav.bottom.fvMyForms', perm: 'forms.fill', module: 'field_verification' },
  { href: '/field-verification/forms/reports', icon: BarChart3, labelKey: 'nav.bottom.fvFormsReports', perm: 'forms.reports', module: 'field_verification' },
  // ── Route Planner — rep mobile mission execution (canonical RP Missions path). Gated to
  //    the route_management module + route_planner.execute so a salesman/driver reaches
  //    their assigned missions from the bottom bar. ──
  { href: '/distribution/route-planner/my-missions', icon: Route, labelKey: 'nav.bottom.myMissions', perm: 'route_planner.execute', module: 'route_management' },
  // Generic Home — hidden for the unified salesman (Today IS home, no duplicate).
  { href: '/dashboard', icon: Home, labelKey: 'nav.bottom.home', hideWhenUnified: true },
  // Approver direct access (placed high so supervisors/managers get it in the top
  // slots, not buried in "More"). Gated by an approval permission.
  { href: '/approvals/queue', icon: ClipboardCheck, labelKey: 'nav.bottom.approvals', perm: 'day.approve_close_exception' },
  // Field loop: the salesman's "Today" home (only shown to field reps).
  { href: '/today', icon: MapPin, labelKey: 'nav.bottom.today', perm: 'field.sales' },
  // ── Customers (mutually-exclusive group 'customers') ──
  // (Unified salesman: NO Customer tab — the picker lives inside Today, so the
  // bottom nav is Today · Van Stock · More. Selling/collection start from the
  // embedded picker → the visit context.)
  { href: '/fashion/customers', icon: Users, labelKey: 'nav.bottom.customers', perm: 'fashion.sell', module: 'fashion', group: 'customers' },
  { href: '/customers', icon: Users, labelKey: 'nav.bottom.customers', perm: 'customers.manage', module: 'sales', group: 'customers' },
  // ── Field Requests (van salesmen) — PROMOTED to a primary bottom tab so the rep
  //    reaches the Requests hub without opening "More":
  //    Today · Customers · Field Requests · Inventory · More.
  //    `requestsOnly` → only van salesmen with platform.salesman_requests see it.
  //    Distinct from the generic "Change Requests" (/change-requests) module. ──
  { href: '/field/van-sales/requests', icon: Inbox, labelKey: 'nav.bottom.requests', perm: 'field.sales', requestsOnly: true },
  // ── Inventory (mutually-exclusive group 'inventory') ──
  // Van reps see their VAN stock (not the generic warehouse view) — F6.
  { href: '/field/stock', icon: Boxes, labelKey: 'nav.bottom.inventory', perm: 'field.sales', group: 'inventory', vanSalesOnly: true },
  { href: '/fashion/inventory', icon: Boxes, labelKey: 'nav.bottom.inventory', perm: 'fashion.inventory', module: 'fashion', group: 'inventory' },
  { href: '/inventory', icon: Boxes, labelKey: 'nav.bottom.inventory', perm: 'inventory.view', module: 'inventory', group: 'inventory' },
  // ── Sell (mutually-exclusive group 'sell') — ordered AFTER Inventory so van
  //    salesmen get Field Requests + Inventory in the primary bar and Sell falls
  //    into "More" (selling is Customer-first: Customer → Statement → Collect → Sell).
  //    Fashion shops sell from the Fashion POS; everyone else from generic Sales.
  //    The Van-Sell tab is hidden for the unified salesman (one operational entry). ──
  { href: '/field/van-sales/sell', icon: Truck, labelKey: 'nav.bottom.sell', perm: 'field.sales', group: 'sell', vanSalesOnly: true, hideWhenUnified: true },
  { href: '/fashion/sell', icon: ScanBarcode, labelKey: 'nav.bottom.sell', perm: 'fashion.sell', module: 'fashion', group: 'sell' },
  { href: '/sales/invoices', icon: Zap, labelKey: 'nav.bottom.sell', perm: 'sales.sell', module: 'sales', group: 'sell' },
];

export interface BottomNavContext {
  permissions: Permission[];
  isSuperAdmin: boolean;
  /** Company's enabled feature modules. Empty = unrestricted (platform owner /
   *  legacy tenant), matching `visibleSections`'s fallback. */
  modules: Module[];
  /** Company business type, used to pick the most specific route within a
   *  mutually-exclusive group (e.g. clothing → Fashion POS). */
  businessType?: string | null;
  /** Whether Van Sales is active for the tenant (gates the Van-Sell "Sell" tab). */
  vanSalesActive?: boolean;
  /** Whether the unified salesman workspace is active for THIS user (flag ON +
   *  van salesman). Surfaces the Customer-first tab and removes the duplicate
   *  Home / standalone Sell tabs so Today is the one operational entry. */
  unifiedWorkspace?: boolean;
  /** Whether the Salesman Requests hub is active for THIS user (flag ON + van
   *  salesman). Surfaces the Requests tab. */
  requestsEnabled?: boolean;
}

/**
 * Resolve the visible bottom-nav tabs: permission + module gated, with
 * mutually-exclusive groups collapsed to the single most-specific route for the
 * company's business type. Pure (no JSX / hooks) so the routing is unit-tested.
 *
 * Group preference: `clothing` companies prefer the Fashion route (`/fashion/*`)
 * for every mutually-exclusive group (sell, customers, inventory); everyone else
 * prefers the generic route. A candidate only survives if its module is enabled,
 * so fashion-only shops get the Fashion screens and never a generic (un-entitled)
 * route's upgrade screen.
 */
export function resolveBottomNavTabs(
  ctx: BottomNavContext,
  tabs: BottomNavTab[] = BOTTOM_NAV_TABS,
): BottomNavTab[] {
  const can = (p?: Permission) => !p || ctx.isSuperAdmin || ctx.permissions.includes(p);
  // Pack-only tenant (enabled modules are EXCLUSIVELY standalone packs, e.g. the
  // "Field Verification Only" template): show ONLY the pack's own tabs. The generic
  // operational tabs (Home / Approvals / Today / Sell / …) are suppressed so the
  // mobile bar matches the sidebar (pack section + Settings only). Mirrors the
  // sidebar's pack-only gating in `visibleSections`. Empty modules (platform owner /
  // legacy) is unrestricted, as elsewhere, so it is never suppressed.
  const packOnlyTenant =
    ctx.modules.length > 0 && ctx.modules.every((m) => STANDALONE_PACK_MODULES.includes(m));
  const isPackTab = (t: BottomNavTab) => !!t.module && STANDALONE_PACK_MODULES.includes(t.module);
  const candidates = tabs.filter(
    (t) => (!packOnlyTenant || isPackTab(t))
      && can(t.perm) && isModuleGateOpen(ctx.modules, t.module) && (!t.vanSalesOnly || ctx.vanSalesActive)
      // Unified salesman workspace: surface unifiedOnly tabs, drop hideWhenUnified ones.
      && (!t.unifiedOnly || ctx.unifiedWorkspace) && !(t.hideWhenUnified && ctx.unifiedWorkspace)
      // Salesman Requests hub: surface the Requests tab only when its flag is on.
      && (!t.requestsOnly || ctx.requestsEnabled),
  );

  // Within a mutually-exclusive group, clothing prefers the Fashion route; every
  // other business type prefers the generic route.
  const prefersFashion = ctx.businessType === 'clothing';
  const isFashionRoute = (href: string) => href.startsWith('/fashion/');

  const chosen = new Map<string, string>(); // group -> chosen href
  for (const t of candidates) {
    const g = t.group;
    if (!g || chosen.has(g)) continue;
    const group = candidates.filter((c) => c.group === g);
    // Van Sales reps get the Van-Sell workflow as their "Sell" tab (the primary
    // FMCG selling path); otherwise fall back to fashion-vs-generic preference.
    const pick = group.find((c) => c.vanSalesOnly)
      ?? group.find((c) => isFashionRoute(c.href) === prefersFashion)
      ?? group[0];
    chosen.set(g, pick.href);
  }
  return candidates.filter((t) => !t.group || chosen.get(t.group) === t.href);
}
