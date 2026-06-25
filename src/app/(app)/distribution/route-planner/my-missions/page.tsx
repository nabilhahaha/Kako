import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasAnyPermission } from '@/lib/erp/permissions';
import { MyMissions } from '../my-missions';

export const metadata: Metadata = { title: 'VANTORA — My Missions' };

/**
 * PR-4 — the rep's "My Missions" launcher (canonical RP Missions path). Visible to anyone
 * who can execute or view Route Planner (reps hold route_planner.execute; managers reach it
 * via route_planner.view / reports.view). The list itself only ever returns missions
 * assigned to the signed-in user (server action + RLS on erp_rp_missions).
 */
export default async function MyMissionsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const allowed = ctx.isRoutePlannerExperience
    || hasAnyPermission(ctx, ['route_planner.execute', 'route_planner.view', 'reports.view']);
  if (!allowed) redirect('/dashboard');
  return <MyMissions />;
}
