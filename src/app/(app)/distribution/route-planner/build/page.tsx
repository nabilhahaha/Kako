import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasAnyPermission } from '@/lib/erp/permissions';
import { MissionBuilder } from '../mission-builder';

export const metadata: Metadata = { title: 'VANTORA — Build a Plan' };

/**
 * PR-5 — the Mission Builder page (admin/planner). Gated on route_planner.edit (managers
 * reach it via reports.view). The save/assign writes are additionally perm-gated
 * (mission create/assign) and RLS-backed in the server action.
 */
export default async function BuildMissionPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const allowed = ctx.isRoutePlannerExperience
    || hasAnyPermission(ctx, ['route_planner.edit', 'route_planner.upload', 'reports.view']);
  if (!allowed) redirect('/dashboard');
  return <MissionBuilder />;
}
