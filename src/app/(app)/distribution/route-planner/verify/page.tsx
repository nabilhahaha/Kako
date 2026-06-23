import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { MyNearbyCustomers } from '../my-nearby-customers';

export const metadata: Metadata = { title: 'VANTORA — My Nearby Customers' };

/**
 * FV-3 — mobile-first "My Nearby Customers" field screen. Same gate as the Route Planner
 * workspace (module route_management + page permission); the rep only ever sees their OWN
 * assigned customers (enforced in the FV-2 server actions + RLS 0367).
 */
export default async function VerifyPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const allowed = ctx.isRoutePlannerExperience
    || hasPermission(ctx, 'route_planner.view')
    || hasPermission(ctx, 'reports.view');
  if (!allowed) redirect('/dashboard');
  return <MyNearbyCustomers />;
}
