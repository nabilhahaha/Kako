/**
 * Fast Food / Restaurant POS — role-aware sidebar navigation (pure, testable).
 *
 * The dedicated POS shell shows ONLY POS-relevant items, never the full ERP nav. A plain
 * cashier sees the minimum sell-first set; a POS manager/admin additionally sees Reports and
 * Setup (products & images) plus a "back office" escape hatch to the full platform. Keeping
 * this a pure function (no React, no DB) means the cashier-vs-manager visibility is unit-tested
 * and can never silently drift.
 */

export type PosNavIcon = 'pos' | 'orders' | 'shift' | 'reports' | 'setup' | 'help' | 'backoffice';

export interface PosNavItem {
  key: string;
  href: string;
  /** i18n key under the `foodPosNav` namespace. */
  labelKey: string;
  icon: PosNavIcon;
  /** A manager-only escape hatch back to the full ERP (cashier never sees it). */
  backOffice?: boolean;
}

export interface PosNavInput {
  /** A POS manager/admin (admin/manager/supervisor/branch_manager, or super/platform). A plain
   *  cashier is NOT a manager and is locked to the sell-first set. */
  isManager: boolean;
}

/** The items every POS user (cashier included) gets — the sell-first core. */
const CORE: PosNavItem[] = [
  { key: 'pos', href: '/pos', labelKey: 'foodPosNav.pos', icon: 'pos' },
  { key: 'orders', href: '/pos/orders', labelKey: 'foodPosNav.orders', icon: 'orders' },
  { key: 'shift', href: '/pos/shift', labelKey: 'foodPosNav.shift', icon: 'shift' },
];

/** Manager/admin-only items — back-office configuration the cashier must never see. */
const MANAGER: PosNavItem[] = [
  { key: 'reports', href: '/pos/reports', labelKey: 'foodPosNav.reports', icon: 'reports' },
  { key: 'setup', href: '/pos/setup', labelKey: 'foodPosNav.setup', icon: 'setup' },
];

/** Build the POS sidebar items for a user. Cashier → CORE only; manager → CORE + MANAGER. */
export function posNavItems(input: PosNavInput): PosNavItem[] {
  if (!input.isManager) return [...CORE];
  // POS, Orders, Reports, Setup, Shift — operational items first, config grouped after.
  return [CORE[0], CORE[1], ...MANAGER, CORE[2]];
}

/** The manager-only "Back office" link (returns to the full ERP). Cashier gets none. */
export function posBackOfficeItem(input: PosNavInput): PosNavItem | null {
  if (!input.isManager) return null;
  return { key: 'backoffice', href: '/dashboard', labelKey: 'foodPosNav.backOffice', icon: 'backoffice', backOffice: true };
}

/** Branch roles that make a POS user a manager/admin (everyone else is a plain cashier). */
export const POS_MANAGER_ROLES = ['admin', 'manager', 'supervisor', 'branch_manager', 'area_manager'] as const;
