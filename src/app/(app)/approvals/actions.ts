'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, type ActionResult } from '@/lib/erp/guards';
import { applyWorkflowOutcome, type WorkflowOutcome } from '@/lib/erp/workflow-handlers';

/** ── Approvals — decide a workflow task ────────────────────────────────────
 *  Calls the generic engine RPC (which enforces the assignee + advances the
 *  workflow). When the instance completes, applies the per-entity outcome via
 *  the handler registry — keeping the engine entity-agnostic. */
export async function decideTask(
  taskId: string,
  decision: 'approve' | 'reject',
  comment?: string,
): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  if (decision !== 'approve' && decision !== 'reject') return { ok: false, error: 'invalid decision' };
  // Rejection reason is mandatory (governance requirement).
  if (decision === 'reject' && !(comment && comment.trim())) {
    return { ok: false, error: 'rejection_reason_required' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('erp_workflow_decide', {
    p_task_id: taskId, p_decision: decision, p_comment: comment || null,
  });
  if (error) return { ok: false, error: error.message };

  const res = (data ?? {}) as { final?: boolean; status?: string; entity?: string; record_id?: string };
  if (res.final && res.entity && res.record_id && (res.status === 'approved' || res.status === 'rejected')) {
    await applyWorkflowOutcome(res.entity, res.record_id, res.status as WorkflowOutcome, comment ?? null);
  }
  revalidatePath('/approvals');
  revalidatePath('/customers');
  return { ok: true };
}
