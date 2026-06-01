'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { friendlyDbError, type ActionResult } from '@/lib/erp/guards';

/** ── Scheduler health dashboard — actions (PR-2). Admin-only (enforced in RPCs). */
async function ok() { const ctx = await getUserContext(); return !!ctx?.company?.id; }

export async function ensureDefaults(): Promise<ActionResult> {
  if (!(await ok())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_sched_ensure_defaults');
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/settings/scheduler');
  return { ok: true };
}

export async function runJob(id: string): Promise<ActionResult<{ ok: boolean; error?: string }>> {
  if (!(await ok())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('erp_sched_run_job', { p_job_id: id, p_triggered_by: 'manual' });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/settings/scheduler');
  return { ok: true, data: data as { ok: boolean; error?: string } };
}

export async function setEnabled(id: string, enabled: boolean): Promise<ActionResult> {
  if (!(await ok())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_sched_set_enabled', { p_id: id, p_enabled: enabled });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/settings/scheduler');
  return { ok: true };
}
