import type { Permission } from './permissions';
import type { Module } from './navigation';

/**
 * The best landing page for a user, based on their business modules and role —
 * so a receptionist opens the front desk, a doctor opens their queue, and a
 * restaurant opens its floor, instead of a generic dashboard.
 */
export function resolveHomePath(ctx: {
  isPlatformOwner?: boolean;
  /** The tenant company the user belongs to. A vendor-tier user (platform owner
   *  / platform staff) has none — they must NOT be routed into a tenant vertical
   *  home: they hold ALL_MODULES by default, which would otherwise pick a vertical
   *  and, for staff, bounce off that vertical's permission guard into a redirect
   *  loop. */
  companyId?: string | null;
  modules: Module[];
  permissions: Permission[];
}): string {
  // The vendor platform owner runs the platform, not a tenant store.
  if (ctx.isPlatformOwner) return '/platform';

  // A user explicitly tied to NO tenant company (platform staff / orphaned) has
  // no vertical home — land them on the neutral dashboard. `companyId` is present
  // on UserContext so all real callers pass it; when omitted (legacy/test callers
  // that pass only modules) the original module-based routing is preserved.
  if (ctx.companyId === null) return '/dashboard';

  const has = (m: Module) => ctx.modules.includes(m);
  const can = (p: Permission) => ctx.permissions.includes(p);

  // Fashion Store (clothing): the store dashboard is home — no generic dashboard.
  if (has('fashion')) return '/fashion';

  // Clinic: route to the role-specific screen.
  if (has('clinic')) {
    if (can('clinic.manage')) return '/clinic';
    if (can('clinic.doctor')) return '/clinic/doctor';
    if (can('clinic.reception')) return '/clinic/reception';
    return '/clinic';
  }

  // Other verticals open their own home.
  if (has('restaurant')) return '/restaurant';
  if (has('salon')) return '/salon';
  if (has('laundry')) return '/laundry';
  if (has('pharmacy')) return '/pharmacy/dispense';
  if (has('hotel')) return '/hotel/bookings';
  if (has('wholesale')) return '/wholesale';

  // General / retail (sales + inventory) stays on the main dashboard.
  return '/dashboard';
}
