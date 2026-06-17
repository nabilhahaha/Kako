import type { NavSection, NavItem } from './navigation';
import type { BranchRole } from './types';
import {
  MapPin, Wallet, Users, Truck, ClipboardCheck, Map, PackageCheck, BarChart3,
  LayoutDashboard, Receipt, Boxes, ClipboardList, ArrowLeftRight, ReceiptText, Clock, type LucideIcon,
} from 'lucide-react';

/**
 * Role-based NAVIGATION PROFILES — a RELEVANCE layer on top of permission gating.
 * Permissions are unchanged; this only decides which already-visible items appear
 * in a role's short PRIMARY menu, what is kept in "More", and what is hidden from
 * the menu entirely (UI-only — the URL and the user's permission are untouched).
 * The goal is to make each role's sidebar feel like a focused tool, not a full ERP.
 *
 * A profile item is shown only when its href is actually visible to the user
 * (i.e. they hold the permission for it) — so nothing here can grant access.
 * Admin / manager and any elevated user (super-admin / platform owner) get the
 * full, un-profiled navigation.
 */
interface ProfileItem {
  /** i18n key (nav.profile.*) for the primary label. */
  labelKey: string;
  href: string;
  icon: LucideIcon;
}

interface NavProfile {
  /** The short, curated primary menu (relabelled / re-iconed daily tools). */
  primary: ProfileItem[];
  /**
   * Optional ALLOWLIST of hrefs permitted in "More". When set, any visible item
   * that is neither primary nor in this list is HIDDEN from the menu entirely
   * (UI-only — permission + URL access unchanged). Use this to turn a broadly-
   * permissioned role (e.g. a salesman who also holds reports.view) into a
   * focused tool instead of dumping every back-office screen into More.
   */
  more?: string[];
  /**
   * Optional DENYLIST of hrefs to drop from "More" (UI-only). Applied only when
   * `more` is NOT set — a lighter touch for broad roles that should keep most of
   * the tree but lose a few clearly wrong-role entries.
   */
  hide?: string[];
}

/** Field-sales "More" — SIMPLIFIED to only the screens a rep uses during daily
 *  field execution. Selling itself runs from My Day (van-sell), so the standalone
 *  Sell/POS, Rep App, Rep Accounting/Settlement, Cash Box/Treasury, Attention,
 *  Route Execution, Visit Planning, Rep Journey, and Vehicle Reconciliation are
 *  hidden from the rep menu (UI-only — permission + URL access unchanged; they
 *  remain reachable for the roles that own them). */
const SALESMAN_MORE = [
  // Final pilot trim. Selling/invoicing run from My Day, so the standalone
  // Sales Order/Invoice and Offline entries are dropped too. Field Requests is
  // RETAINED because My Day exposes no path to request-creation (new customer /
  // data change / credit / route transfer) — hiding it would orphan that
  // workflow (verify #5/#6). UI-only; permission + URL access unchanged.
  '/field/van-sales/requests',        // Field Requests (new customer, data, GPS, credit, …)
  '/field/van-sales/my-returns',      // Returns
  '/field/van-sales/statement',       // Customer Statements / Profile
  '/field/van-sales/summary',         // My Daily Summary (read-only)
  '/field/van-sales/cash-custody',    // My Cash Custody (own cash + collections + movement)
  '/inventory/requests',              // Load Request (van stock)
  '/notifications',
];

const SALESMAN: NavProfile = {
  primary: [
    { labelKey: 'nav.profile.today', href: '/today', icon: MapPin },
    { labelKey: 'nav.profile.customers', href: '/customers', icon: Users },
    { labelKey: 'nav.profile.collect', href: '/collections', icon: Wallet },
    { labelKey: 'nav.profile.van', href: '/field/stock', icon: Truck },
  ],
  more: SALESMAN_MORE,
};

const NAV_PROFILES: Partial<Record<BranchRole, NavProfile>> = {
  salesman: SALESMAN,
  driver: SALESMAN,
  supervisor: {
    primary: [
      { labelKey: 'nav.profile.approvals', href: '/approvals/queue', icon: ClipboardCheck },
      { labelKey: 'nav.profile.team', href: '/supervisor', icon: Users },
      { labelKey: 'nav.profile.coverage', href: '/territory', icon: Map },
      { labelKey: 'nav.profile.vanRecon', href: '/field/van-reconciliation', icon: PackageCheck },
      { labelKey: 'nav.profile.reports', href: '/reports', icon: BarChart3 },
    ],
    // A supervisor verifies & coaches — they don't sell or run the warehouse.
    hide: ['/sales/pos', '/sales/invoices', '/products', '/inventory', '/inventory/low-stock', '/warehouses'],
  },
  branch_manager: {
    primary: [
      { labelKey: 'nav.profile.manager', href: '/manager', icon: LayoutDashboard },
      { labelKey: 'nav.profile.approvals', href: '/approvals/queue', icon: ClipboardCheck },
      { labelKey: 'nav.profile.purchasing', href: '/purchases/orders', icon: Receipt },
      { labelKey: 'nav.profile.reports', href: '/reports', icon: BarChart3 },
      { labelKey: 'nav.profile.customers', href: '/customers', icon: Users },
      { labelKey: 'nav.profile.inventory', href: '/inventory', icon: Boxes },
    ],
    // Broad role — keep the tree, only drop the field rep's personal screens.
    hide: ['/field/offline', '/rep'],
  },
  warehouse_keeper: {
    primary: [
      { labelKey: 'nav.profile.requests', href: '/inventory/requests', icon: ClipboardList },
      { labelKey: 'nav.profile.stock', href: '/inventory', icon: Boxes },
      { labelKey: 'nav.profile.receive', href: '/purchases/orders', icon: PackageCheck },
      { labelKey: 'nav.profile.transfers', href: '/inventory/transfers', icon: ArrowLeftRight },
      { labelKey: 'nav.profile.approvals', href: '/approvals/queue', icon: ClipboardCheck },
    ],
    // Stock-keeper doesn't sell or collect cash.
    hide: ['/sales/pos', '/sales/invoices', '/collections', '/cashbox'],
  },
  accountant: {
    primary: [
      { labelKey: 'nav.profile.collect', href: '/collections', icon: Wallet },
      { labelKey: 'nav.profile.accounting', href: '/accounting/journal', icon: Wallet },
      { labelKey: 'nav.profile.vouchers', href: '/accounting/vouchers', icon: ReceiptText },
      { labelKey: 'nav.profile.aging', href: '/accounting/aging', icon: Clock },
      { labelKey: 'nav.profile.suppliers', href: '/suppliers', icon: Truck },
    ],
    // Finance doesn't sell at the POS or work the field.
    hide: ['/sales/pos', '/field/route', '/field/offline', '/rep'],
  },
  viewer: {
    primary: [
      { labelKey: 'nav.profile.dashboard', href: '/dashboard', icon: LayoutDashboard },
      { labelKey: 'nav.profile.reports', href: '/reports', icon: BarChart3 },
      { labelKey: 'nav.profile.inventory', href: '/inventory', icon: Boxes },
    ],
  },
};

/** Pick which role's profile applies (mirrors home.ts seniority). admin/manager
 *  → no profile (they want the full system). driver reuses the salesman profile. */
export function profileRoleFor(roles: readonly BranchRole[]): BranchRole | null {
  if (roles.includes('admin') || roles.includes('manager')) return null;
  for (const r of ['branch_manager', 'supervisor', 'accountant', 'warehouse_keeper', 'salesman', 'driver'] as BranchRole[]) {
    if (roles.includes(r)) return r === 'driver' ? 'salesman' : r;
  }
  return null;
}

/**
 * Reorganise the (already permission-filtered) sections into a curated PRIMARY
 * section + a single "More" section, per the user's role profile. "More" items
 * keep their original section as a sub-header (so a long list reads as grouped,
 * not a flat dump), are de-duplicated by href, and — when the profile defines a
 * `more` allowlist or `hide` denylist — wrong-role entries are dropped from the
 * menu entirely (UI-only; permission + URL access are unchanged). Elevated users
 * and roles without a profile get the sections unchanged.
 */
export function applyNavProfile(
  sections: NavSection[],
  roles: readonly BranchRole[],
  opts: { isSuperAdmin?: boolean; isPlatformOwner?: boolean } = {},
): NavSection[] {
  if (opts.isSuperAdmin || opts.isPlatformOwner) return sections;
  const role = profileRoleFor(roles);
  const profile = role ? NAV_PROFILES[role] : undefined;
  if (!profile) return sections;

  // Flatten, remembering each item's source section so we can re-group "More".
  const allItems: { item: NavItem; section: string }[] = [];
  for (const s of sections) for (const item of s.items) allItems.push({ item, section: s.title });
  const visibleHrefs = new Set(allItems.map((e) => e.item.href));
  const primaryHrefs = new Set(profile.primary.map((p) => p.href));
  const allow = profile.more ? new Set(profile.more) : null;
  const deny = profile.hide ? new Set(profile.hide) : null;

  // Primary = profile items the user can actually reach (relabelled / re-iconed).
  const primary: NavItem[] = profile.primary
    .filter((p) => visibleHrefs.has(p.href))
    .map((p) => ({ label: p.labelKey, href: p.href, icon: p.icon }));

  // More = remaining visible items, in original order, de-duplicated by href,
  // filtered by the allowlist (if any) or denylist, and tagged with their source
  // section so the sidebar renders sub-headers.
  const seen = new Set<string>();
  const more: NavItem[] = [];
  for (const { item, section } of allItems) {
    if (primaryHrefs.has(item.href) || seen.has(item.href)) continue;
    if (allow && !allow.has(item.href)) continue;
    if (deny && deny.has(item.href)) continue;
    seen.add(item.href);
    more.push({ ...item, group: section });
  }

  const out: NavSection[] = [];
  if (primary.length > 0) out.push({ title: 'nav.sections.primary', items: primary });
  if (more.length > 0) out.push({ title: 'nav.sections.more', items: more });
  return out.length > 0 ? out : sections;
}
