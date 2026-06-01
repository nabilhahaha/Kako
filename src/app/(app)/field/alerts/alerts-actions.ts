'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { friendlyDbError, type ActionResult } from '@/lib/erp/guards';

/** ── Field Execution — alert inbox actions (FE-5e-4) ────────────────────────
 *  Thin wrappers over the scope-checked RPCs (erp_fe_*). The DB enforces scope
 *  and admin/owner rules; these just surface friendly results to the inbox. */
async function ok(): Promise<boolean> {
  const ctx = await getUserContext();
  return !!ctx?.company?.id && ctx.modules.includes('field_ops');
}

/** Run company-wide detection (admin/owner only — enforced in the RPC). */
export async function runDetection(): Promise<ActionResult<{ total: number }>> {
  if (!(await ok())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('erp_fe_run_alert_rules', {});
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/field/alerts');
  return { ok: true, data: data as { total: number } };
}

/** Assign (or clear) an alert's owner; clearing passes null. */
export async function assignAlert(alertId: string, ownerId: string | null): Promise<ActionResult> {
  if (!(await ok())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_fe_alert_assign', { p_alert: alertId, p_owner: ownerId });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/field/alerts');
  return { ok: true };
}

/** Lazy-load one alert's full note history (scope-checked in the RPC). */
export async function getAlertNotes(alertId: string): Promise<ActionResult<{ notes: { at: string; by_name: string | null; status: string; note: string }[] }>> {
  if (!(await ok())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('erp_fe_alert_get', { p_id: alertId });
  if (error) return { ok: false, error: friendlyDbError(error) };
  const notes = (data as { notes?: { at: string; by_name: string | null; status: string; note: string }[] } | null)?.notes ?? [];
  return { ok: true, data: { notes } };
}

/** Move an alert through its lifecycle, optionally recording a note + due date. */
export async function setAlertStatus(alertId: string, status: string, note?: string, due?: string | null): Promise<ActionResult> {
  if (!(await ok())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_fe_alert_set_status', {
    p_alert: alertId, p_status: status, p_note: note && note.trim() ? note.trim() : null, p_due: due || null,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/field/alerts');
  return { ok: true };
}
