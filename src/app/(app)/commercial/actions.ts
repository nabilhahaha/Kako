'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { friendlyDbError, type ActionResult } from '@/lib/erp/guards';

/** ── Commercial Performance Pack — UI actions (CP-6) ────────────────────────
 *  Thin wrappers over the scope-checked CP RPCs. */
async function ok(): Promise<boolean> {
  const ctx = await getUserContext();
  return !!ctx?.company?.id;
}

export interface TargetRow { period: string; dim_type: string; dim_id: string | null; metric: string; amount: number }
export interface TargetIssue { row: number; level: string; code: string; message: string }

/** Validate a batch of target rows (no write) — for the import preview. */
export async function validateTargets(rows: TargetRow[]): Promise<ActionResult<{ issues: TargetIssue[] }>> {
  if (!(await ok())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('erp_cp_targets_validate', { p_rows: rows });
  if (error) return { ok: false, error: friendlyDbError(error) };
  return { ok: true, data: { issues: (data as TargetIssue[]) ?? [] } };
}

/** Import (validate-then-commit). */
export async function importTargets(rows: TargetRow[], status = 'draft'): Promise<ActionResult<{ ok: boolean; imported: number; issues: unknown[] }>> {
  if (!(await ok())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('erp_cp_targets_import', { p_rows: rows, p_status: status });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/commercial/targets');
  return { ok: true, data: data as { ok: boolean; imported: number; issues: unknown[] } };
}

/** Manual single-target save. */
export async function saveTarget(t: TargetRow & { status?: string }): Promise<ActionResult> {
  if (!(await ok())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_cp_target_save', {
    p_period: t.period, p_dim_type: t.dim_type, p_dim_id: t.dim_id, p_metric: t.metric, p_amount: t.amount, p_status: t.status ?? 'draft',
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/commercial/targets');
  return { ok: true };
}

export async function setTargetStatus(id: string, status: string): Promise<ActionResult> {
  if (!(await ok())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_cp_target_set_status', { p_id: id, p_status: status });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/commercial/targets');
  return { ok: true };
}

/** Run / approve commission + incentive (admin; RPCs enforce). */
export async function runCommission(planId: string, month: string): Promise<ActionResult<{ total_payout: number; qualified: number }>> {
  if (!(await ok())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('erp_cp_commission_run', { p_plan: planId, p_month: month });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/commercial/statements');
  return { ok: true, data: data as { total_payout: number; qualified: number } };
}
export async function approveCommission(planId: string, month: string): Promise<ActionResult> {
  if (!(await ok())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_cp_commission_approve', { p_plan: planId, p_month: month });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/commercial/statements');
  return { ok: true };
}
export async function runIncentive(programId: string, month: string): Promise<ActionResult<{ total_payout: number; qualified: number }>> {
  if (!(await ok())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('erp_cp_incentive_run', { p_program: programId, p_month: month });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/commercial/statements');
  return { ok: true, data: data as { total_payout: number; qualified: number } };
}
export async function approveIncentive(programId: string, month: string): Promise<ActionResult> {
  if (!(await ok())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_cp_incentive_approve', { p_program: programId, p_month: month });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/commercial/statements');
  return { ok: true };
}
