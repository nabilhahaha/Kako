import type { Permission } from '@/lib/erp/permissions';
import { isModuleGateOpen, type Module } from '@/lib/erp/navigation';
import { Home, Users, Zap, Boxes, MapPin, ScanBarcode, ClipboardCheck, Truck, type LucideIcon } from 'lucide-react';

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
}

/** Ordered candidate tabs for the mobile bottom bar. The Stock view lives at
 *  `/inventory` (the catalog is `/products`); the inventory tab must point there.
 *  Only the first 4 the user can see are rendered, plus a "More" drawer trigger. */
export const BOTTOM_NAV_TABS: BottomNavTab[] = [
  { href: '/dashboard', icon: Home, labelKey: 'nav.bottom.home' },
  // Approver direct access (placed high so supervisors/managers get it in the top
  // slots, not buried in "More"). Gated by an approval permission.
  { href: '/approvals/queue', icon: ClipboardCheck, labelKey: 'nav.bottom.approvals', perm: 'day.approve_close_exception' },
  // Field loop: the salesman's "Today" home (only shown to field reps).
  { href: '/today', icon: MapPin, labelKey: 'nav.bottom.today', perm: 'field.sales' },
  // ── Customers (mutually-exclusive group 'customers') ──
  { href: '/fashion/customers', icon: Users, labelKey: 'nav.bottom.customers', perm: 'fashion.sell', module: 'fashion', group: 'customers' },
  { href: '/customers', icon: Users, labelKey: 'nav.bottom.customers', perm: 'customers.manage', module: 'sales', group: 'customers' },
  // ── Sell (mutually-exclusive group 'sell') ──
  // Fashion shops sell from the Fashion POS; everyone else from generic Sales.
  // The resolver shows only one, gated by the enabled module so a fashion-only
  // clothing company never lands on the `sales`-module-gated upgrade screen.
  { href: '/field/van-sales/sell', icon: Truck, labelKey: 'nav.bottom.sell', perm: 'field.sales', group: 'sell', vanSalesOnly: true },
  { href: '/fashion/sell', icon: ScanBarcode, labelKey: 'nav.bottom.sell', perm: 'fashion.sell', module: 'fashion', group: 'sell' },
  { href: '/sales/invoices', icon: Zap, labelKey: 'nav.bottom.sell', perm: 'sales.sell', module: 'sales', group: 'sell' },
  // ── Inventory (mutually-exclusive group 'inventory') ──
  // Van reps see their VAN stock (not the generic warehouse view) — F6.
  { href: '/field/stock', icon: Boxes, labelKey: 'nav.bottom.inventory', perm: 'field.sales', group: 'inventory', vanSalesOnly: true },
  { href: '/fashion/inventory', icon: Boxes, labelKey: 'nav.bottom.inventory', perm: 'fashion.inventory', module: 'fashion', group: 'inventory' },
  { href: '/inventory', icon: Boxes, labelKey: 'nav.bottom.inventory', perm: 'inventory.view', module: 'inventory', group: 'inventory' },
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
  const candidates = tabs.filter(
    (t) => can(t.perm) && isModuleGateOpen(ctx.modules, t.module) && (!t.vanSalesOnly || ctx.vanSalesActive),
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
