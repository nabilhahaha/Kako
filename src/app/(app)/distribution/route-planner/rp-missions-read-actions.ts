'use server';

// ============================================================================
// Phase C2 — read-only supervisor missions board. Company-scoped READS over
// erp_rp_missions (RLS-enforced). No writes: create/assign/update flows would touch the
// per-user mission_perms model (migration 0362) and are intentionally deferred to a later,
// reported phase. Mission status values come from the merged route-planner-mission list.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import type { MissionStatus } from '@/lib/erp/route-planner-mission';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface MissionRow {
  id: string;
  name: string;
  status: MissionStatus;
  missionDate: string | null;
  stopCount: number;
  assigned: boolean;
  createdAt: string;
}

export async function getMissionsBoard(): Promise<Result<MissionRow[]>> {
  const ctx = await getUserContext();
  if (!ctx?.companyId) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data, error } = await sb.from('erp_rp_missions')
    .select('id, name, status, mission_date, stop_count, assigned_to, created_at')
    .eq('company_id', ctx.companyId)
    .order('mission_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) return { ok: false, error: error.message };
  const rows: MissionRow[] = (data ?? []).map((m) => ({
    id: m.id as string,
    name: (m.name as string) ?? '',
    status: (m.status as MissionStatus),
    missionDate: (m.mission_date as string | null) ?? null,
    stopCount: (m.stop_count as number) ?? 0,
    assigned: Boolean(m.assigned_to),
    createdAt: m.created_at as string,
  }));
  return { ok: true, data: rows };
}
