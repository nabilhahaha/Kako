'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, type ActionResult } from '@/lib/erp/guards';
import { applyWorkflowOutcome, type WorkflowOutcome } from '@/lib/erp/workflow-handlers';
import { resumeRun } from '@/lib/workflow/runtime-service';

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

  // Runtime-owned runs (generalized workflows): mark the task without engine
  // advancement, then let the TS runtime resume past the approval step.
  const { data: task } = await supabase.from('erp_workflow_tasks').select('instance_id').eq('id', taskId).maybeSingle();
  const instanceId = (task as { instance_id?: string } | null)?.instance_id;
  if (instanceId) {
    const { data: inst } = await supabase.from('erp_workflow_instances').select('runtime_state').eq('id', instanceId).maybeSingle();
    if ((inst as { runtime_state?: string | null } | null)?.runtime_state) {
      const { error: dErr } = await supabase.rpc('erp_workflow_decide_runtime', {
        p_task_id: taskId, p_decision: decision, p_comment: comment || null,
      });
      if (dErr) return { ok: false, error: dErr.message };
      await resumeRun(supabase, instanceId);   // runtime advances; outcomes handled by executors
      revalidatePath('/approvals');
      return { ok: true };
    }
  }

  // Legacy approval workflows — engine owns advancement (unchanged).
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
