import type { NavSection, NavItem } from './navigation';
import type { BranchRole } from './types';
import {
  MapPin, Zap, Wallet, Users, Truck, ClipboardCheck, Map, PackageCheck, BarChart3,
  LayoutDashboard, Receipt, Boxes, ClipboardList, ArrowLeftRight, ReceiptText, Clock, type LucideIcon,
} from 'lucide-react';

/**
 * Role-based NAVIGATION PROFILES — a RELEVANCE layer on top of permission gating.
 * Permissions are unchanged; this only decides which already-visible items appear
 * in a role's short PRIMARY menu, with everything else folded into "More". The
 * goal is to make each role's sidebar feel like a focused tool, not a full ERP.
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

const SALESMAN: ProfileItem[] = [
  { labelKey: 'nav.profile.today', href: '/today', icon: MapPin },
  { labelKey: 'nav.profile.sell', href: '/sales/pos', icon: Zap },
  { labelKey: 'nav.profile.collect', href: '/collections', icon: Wallet },
  { labelKey: 'nav.profile.customers', href: '/customers', icon: Users },
  { labelKey: 'nav.profile.van', href: '/field/stock', icon: Truck },
];

const NAV_PROFILES: Partial<Record<BranchRole, ProfileItem[]>> = {
  salesman: SALESMAN,
  driver: SALESMAN,
  supervisor: [
    { labelKey: 'nav.profile.approvals', href: '/approvals/queue', icon: ClipboardCheck },
    { labelKey: 'nav.profile.team', href: '/supervisor', icon: Users },
    { labelKey: 'nav.profile.coverage', href: '/territory', icon: Map },
    { labelKey: 'nav.profile.vanRecon', href: '/field/van-reconciliation', icon: PackageCheck },
    { labelKey: 'nav.profile.reports', href: '/reports', icon: BarChart3 },
  ],
  branch_manager: [
    { labelKey: 'nav.profile.manager', href: '/manager', icon: LayoutDashboard },
    { labelKey: 'nav.profile.approvals', href: '/approvals/queue', icon: ClipboardCheck },
    { labelKey: 'nav.profile.purchasing', href: '/purchases/orders', icon: Receipt },
    { labelKey: 'nav.profile.reports', href: '/reports', icon: BarChart3 },
    { labelKey: 'nav.profile.customers', href: '/customers', icon: Users },
    { labelKey: 'nav.profile.inventory', href: '/inventory', icon: Boxes },
  ],
  warehouse_keeper: [
    { labelKey: 'nav.profile.requests', href: '/inventory/requests', icon: ClipboardList },
    { labelKey: 'nav.profile.stock', href: '/inventory', icon: Boxes },
    { labelKey: 'nav.profile.receive', href: '/purchases/orders', icon: PackageCheck },
    { labelKey: 'nav.profile.transfers', href: '/inventory/transfers', icon: ArrowLeftRight },
    { labelKey: 'nav.profile.approvals', href: '/approvals/queue', icon: ClipboardCheck },
  ],
  accountant: [
    { labelKey: 'nav.profile.collect', href: '/collections', icon: Wallet },
    { labelKey: 'nav.profile.accounting', href: '/accounting/journal', icon: Wallet },
    { labelKey: 'nav.profile.vouchers', href: '/accounting/vouchers', icon: ReceiptText },
    { labelKey: 'nav.profile.aging', href: '/accounting/aging', icon: Clock },
    { labelKey: 'nav.profile.suppliers', href: '/suppliers', icon: Truck },
  ],
  viewer: [
    { labelKey: 'nav.profile.dashboard', href: '/dashboard', icon: LayoutDashboard },
    { labelKey: 'nav.profile.reports', href: '/reports', icon: BarChart3 },
    { labelKey: 'nav.profile.inventory', href: '/inventory', icon: Boxes },
  ],
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
 * section + a single "More" section, per the user's role profile. Elevated users
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

  const allItems = sections.flatMap((s) => s.items);
  const visibleHrefs = new Set(allItems.map((i) => i.href));
  const primaryHrefs = new Set(profile.map((p) => p.href));

  // Primary = profile items the user can actually reach (relabelled/re-iconed).
  const primary: NavItem[] = profile
    .filter((p) => visibleHrefs.has(p.href))
    .map((p) => ({ label: p.labelKey, href: p.href, icon: p.icon }));

  // More = every other visible item, in original order, de-duplicated by href.
  const seen = new Set<string>();
  const more: NavItem[] = [];
  for (const it of allItems) {
    if (primaryHrefs.has(it.href) || seen.has(it.href)) continue;
    seen.add(it.href);
    more.push(it);
  }

  const out: NavSection[] = [];
  if (primary.length > 0) out.push({ title: 'nav.sections.primary', items: primary });
  if (more.length > 0) out.push({ title: 'nav.sections.more', items: more });
  return out.length > 0 ? out : sections;
}
