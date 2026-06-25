import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasAnyPermission } from '@/lib/erp/permissions';
import { MissionRunner } from '../../mission-runner';

export const metadata: Metadata = { title: 'VANTORA — Mission' };

/**
 * PR-4 — the Mission Runner page. Same gate as My Missions; the runner itself re-checks
 * execution authorisation per mission (assignee or admin/exec-capable) in the server
 * actions, with RLS on erp_rp_missions / stops / events as the backstop.
 */
export default async function MissionRunnerPage({ params }: { params: Promise<{ missionId: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const allowed = ctx.isRoutePlannerExperience
    || hasAnyPermission(ctx, ['route_planner.execute', 'route_planner.view', 'reports.view']);
  if (!allowed) redirect('/dashboard');
  const { missionId } = await params;
  return <MissionRunner missionId={missionId} />;
}
