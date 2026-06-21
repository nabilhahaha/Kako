'use client';

import type { MissionPerms } from '@/lib/erp/route-planner-access';
import { ManagerDashboard } from './manager-dashboard';
import { SupervisorExperience } from './supervisor-experience';

/**
 * Planner home — routes to TWO distinct experiences (not one responsive layout):
 *   • Manager (assign/review capability) → the desktop-first operations cockpit.
 *   • Supervisor / field user            → the mobile-first My Missions execution journey.
 * Both are PLANNER-ONLY (missions, visits, plans, observations) — no sales/finance.
 */
export function PlannerDashboard({ userId, perms, onOpenMissions, onNewMission }: {
  userId: string | null; perms: MissionPerms; onOpenMissions: (scope: 'all' | 'assigned') => void; onNewMission: () => void;
}) {
  if (perms.canAssign || perms.canReview) {
    return <ManagerDashboard userId={userId} perms={perms} onOpenMissions={onOpenMissions} onNewMission={onNewMission} />;
  }
  return <SupervisorExperience perms={perms} />;
}
