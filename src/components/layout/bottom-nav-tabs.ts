import type { Permission } from '@/lib/erp/permissions';
import { Home, Users, Zap, Boxes, MapPin, type LucideIcon } from 'lucide-react';

/** A candidate bottom-nav tab. `href` must resolve to a real route, `labelKey`
 *  is an i18n key, and `perm` (when set) gates visibility. Kept in this pure
 *  (no-JSX) module so the dead-link / mis-routed-tab class of bug is
 *  regression-guarded by a unit test rather than only caught in the browser. */
export interface BottomNavTab {
  href: string;
  icon: LucideIcon;
  labelKey: string;
  /** Required permission; omit for always-visible (home). */
  perm?: Permission;
}

/** Ordered candidate tabs for the mobile bottom bar. The Stock view lives at
 *  `/inventory` (the catalog is `/products`); the inventory tab must point there.
 *  Only the first 4 the user can see are rendered, plus a "More" drawer trigger. */
export const BOTTOM_NAV_TABS: BottomNavTab[] = [
  { href: '/dashboard', icon: Home, labelKey: 'nav.bottom.home' },
  // Field loop: the salesman's "Today" home (only shown to field reps).
  { href: '/today', icon: MapPin, labelKey: 'nav.bottom.today', perm: 'field.sales' },
  { href: '/customers', icon: Users, labelKey: 'nav.bottom.customers', perm: 'customers.manage' },
  { href: '/sales/invoices', icon: Zap, labelKey: 'nav.bottom.sell', perm: 'sales.sell' },
  { href: '/inventory', icon: Boxes, labelKey: 'nav.bottom.inventory', perm: 'inventory.view' },
];
