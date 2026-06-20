import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { listRoutePlannerTenants } from './planner-admin-actions';
import { PlannerAdminConsole } from './planner-admin-console';

export const metadata: Metadata = { title: 'VANTORA Route Planner — Admin' };

/**
 * Route Planner Admin — a limited, product-scoped console. Gated on `isRoutePlannerAdmin`
 * (no full-platform access). Manages only Route Planner tenants: create demo/trial
 * companies and control their subscriptions (extend trial, activate, renew, suspend).
 */
export default async function PlannerAdminPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/planner-login');
  if (!ctx.isRoutePlannerAdmin) redirect('/dashboard');

  const res = await listRoutePlannerTenants();
  const tenants = res.ok ? (res.data ?? []) : [];
  return <PlannerAdminConsole initialTenants={tenants} loadError={res.ok ? null : res.error} />;
}
