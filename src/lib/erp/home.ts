import type { Permission } from './permissions';
import type { Module } from './navigation';
import type { BranchRole } from './types';

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
  /** The user's branch roles. When present (real UserContext callers), each FMCG
   *  role lands on its own work screen instead of the generic dashboard. Absent
   *  (view-as preview / legacy callers) → falls back to dashboard routing. */
  memberships?: ReadonlyArray<{ role: BranchRole }>;
  /** Locked-down Route Planner Demo account → lands directly on the planner. */
  isRoutePlannerDemo?: boolean;
}): string {
  // Route Planner Demo: a single-screen experience — always land on the planner.
  if (ctx.isRoutePlannerDemo) return '/distribution/route-planner';

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

  // Role-aware landing (FMCG / distribution & general): open each role on the
  // screen they use first thing every day, instead of a generic KPI dashboard.
  // Precedence top→down; a multi-role user gets the most senior match. Admin /
  // manager keep the dashboard (it IS their overview).
  const roles = (ctx.memberships ?? []).map((m) => m.role);
  const hasRole = (...rs: BranchRole[]) => rs.some((r) => roles.includes(r));
  if (hasRole('admin', 'manager')) return '/dashboard';
  if (hasRole('branch_manager')) return '/manager';
  if (hasRole('supervisor', 'area_manager', 'regional_manager', 'national_sales_manager', 'sales_director')) return '/approvals/queue';
  if (hasRole('accountant')) return '/collections';
  if (hasRole('warehouse_keeper')) return '/inventory/requests';
  if (hasRole('salesman', 'driver')) return '/today';

  // Any remaining FIELD user (e.g. merchandiser / custom field roles that hold
  // field.sales) lands on My Day. The senior office roles above already returned
  // their own home (admin/manager → dashboard, finance → collections, warehouse →
  // requests, supervisor → approvals), so this only catches field users — it does
  // NOT pull Company Admin / Finance / Warehouse / Ops / Platform onto My Day.
  if (can('field.sales')) return '/today';

  // General / retail with no recognised role stays on the main dashboard.
  return '/dashboard';
}
