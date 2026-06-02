'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { isKnownEntity } from '@/lib/erp/entities';

/** ── Sync jobs — management actions (RLS / user session) ───────────────────
 *  Create / list / update / run-now / revoke sync jobs, plus recent runs. The
 *  dispatcher (service-role) executes them; here we only manage configuration
 *  via guarded RPCs. Gated on integrations.manage. */

interface Result<T = unknown> { ok: boolean; error?: string; data?: T }

export interface SyncJobRow {
  id: string; integrationId: string; integrationName: string; entity: string; direction: string;
  mode: string; intervalMinutes: number; conflictPolicy: string; isActive: boolean;
  cursor: string | null; lastRunAt: string | null;
}
export interface SyncRunRow {
  id: string; jobId: string; status: string; pulled: number; written: number; skipped: number;
  failed: number; error: string | null; startedAt: string; finishedAt: string | null;
}
export interface ConnectionOption { id: string; name: string; adapter: string; direction: string }

async function guard() {
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null, error: 'unauthorized' as const };
  if (!hasPermission(ctx, 'integrations.manage')) return { ctx: null, error: 'unauthorized' as const };
  return { ctx, error: null };
}

export async function listSync(): Promise<Result<{ jobs: SyncJobRow[]; runs: SyncRunRow[]; connections: ConnectionOption[] }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const [{ data: jobs, error: je }, { data: runs }, { data: conns }] = await Promise.all([
    supabase.from('erp_sync_jobs')
      .select('id, integration_id, entity, direction, mode, interval_minutes, conflict_policy, is_active, cursor, last_run_at, integration:erp_integrations(name)')
      .is('revoked_at', null).order('created_at', { ascending: false }),
    supabase.from('erp_sync_runs')
      .select('id, job_id, status, pulled, written, skipped, failed, error, started_at, finished_at')
      .order('started_at', { ascending: false }).limit(50),
    supabase.from('erp_integrations').select('id, name, adapter, direction').eq('is_active', true).is('revoked_at', null),
  ]);
  if (je) return { ok: false, error: je.message };
  return {
    ok: true,
    data: {
      jobs: ((jobs as Record<string, unknown>[]) ?? []).map((j) => ({
        id: j.id as string, integrationId: j.integration_id as string,
        integrationName: ((j.integration as { name?: string } | null)?.name) ?? '—',
        entity: j.entity as string, direction: j.direction as string, mode: j.mode as string,
        intervalMinutes: Number(j.interval_minutes ?? 15), conflictPolicy: j.conflict_policy as string,
        isActive: j.is_active as boolean, cursor: (j.cursor as string) ?? null, lastRunAt: (j.last_run_at as string) ?? null,
      })),
      runs: ((runs as Record<string, unknown>[]) ?? []).map((r) => ({
        id: r.id as string, jobId: r.job_id as string, status: r.status as string,
        pulled: Number(r.pulled ?? 0), written: Number(r.written ?? 0), skipped: Number(r.skipped ?? 0), failed: Number(r.failed ?? 0),
        error: (r.error as string) ?? null, startedAt: r.started_at as string, finishedAt: (r.finished_at as string) ?? null,
      })),
      connections: ((conns as Record<string, unknown>[]) ?? []).map((c) => ({
        id: c.id as string, name: c.name as string, adapter: c.adapter as string, direction: c.direction as string,
      })),
    },
  };
}

export async function createSyncJob(input: {
  integrationId: string; entity: string; direction: string; mode: string;
  intervalMinutes: number; conflictPolicy: string; config: Record<string, unknown>;
}): Promise<Result<{ id: string }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  if (!input.integrationId) return { ok: false, error: 'connection required' };
  if (!isKnownEntity(input.entity)) return { ok: false, error: 'unknown entity' };
  if (!['in', 'out'].includes(input.direction)) return { ok: false, error: 'invalid direction' };
  const supabase = await createClient();
  const { data, error: e } = await supabase.rpc('erp_sync_job_create', {
    p_integration_id: input.integrationId, p_entity: input.entity, p_direction: input.direction,
    p_mode: input.mode, p_interval_minutes: input.intervalMinutes, p_conflict_policy: input.conflictPolicy,
    p_config: input.config,
  });
  if (e) return { ok: false, error: e.message };
  revalidatePath('/settings/integrations/sync');
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function runSyncJobNow(id: string): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { error: e } = await supabase.rpc('erp_sync_job_run_now', { p_id: id });
  if (e) return { ok: false, error: e.message };
  revalidatePath('/settings/integrations/sync');
  return { ok: true };
}

export async function setSyncJobActive(id: string, isActive: boolean): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { error: e } = await supabase.rpc('erp_sync_job_update', { p_id: id, p_is_active: isActive, p_interval_minutes: null, p_mode: null, p_conflict_policy: null, p_config: null });
  if (e) return { ok: false, error: e.message };
  revalidatePath('/settings/integrations/sync');
  return { ok: true };
}

export async function revokeSyncJob(id: string): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { error: e } = await supabase.rpc('erp_sync_job_revoke', { p_id: id });
  if (e) return { ok: false, error: e.message };
  revalidatePath('/settings/integrations/sync');
  return { ok: true };
}
