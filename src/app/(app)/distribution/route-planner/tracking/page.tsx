import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasAnyPermission } from '@/lib/erp/permissions';
import { MissionTracking } from '../mission-tracking';

export const metadata: Metadata = { title: 'VANTORA — Mission Tracking' };

/**
 * PR-6 — supervisor / admin mission tracking. Gated on route_planner.view / reports.view;
 * the rows themselves are RLS-scoped (supervisor → team, admin → company) on erp_rp_missions.
 */
export default async function MissionTrackingPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const allowed = ctx.isRoutePlannerExperience
    || hasAnyPermission(ctx, ['route_planner.view', 'route_planner.edit', 'reports.view']);
  if (!allowed) redirect('/dashboard');
  return <MissionTracking />;
}
