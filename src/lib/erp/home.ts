import type { Permission } from './permissions';
import type { Module } from './navigation';

/**
 * The best landing page for a user, based on their business modules and role —
 * so a receptionist opens the front desk, a doctor opens their queue, and a
 * restaurant opens its floor, instead of a generic dashboard.
 */
export function resolveHomePath(ctx: {
  isPlatformOwner?: boolean;
  modules: Module[];
  permissions: Permission[];
}): string {
  if (ctx.isPlatformOwner) return '/platform';

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
