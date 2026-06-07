// ============================================================================
// Runtime integration adapter — wires the pure runtime to the real DB + side
// effects (Constitution Art. 32). Reuses the single engine's tables/RPCs; adds
// no second engine. The pure layers (runtime.ts, executors, condition-eval) hold
// the logic; this is the thin DB/effect boundary.
//
// Active runtime states (running/waiting) map to engine status='pending' so the
// existing one-active-per-record guard (uq_wf_instance_active) keeps working;
// terminal states map to approved/rejected/cancelled. The precise runtime status
// lives in erp_workflow_instances.runtime_state (0178).
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExecutorDeps, RunState, RuntimeStep } from './executors/types';
import { UPDATE_RECORD_ALLOWLIST } from './executors/types';
import type { RunPatch, RuntimeDeps } from './runtime';
import { evalCondition } from './condition-eval';
import { emitEvent } from './events';
import { hostFromUrl, isEgressAllowed, type EgressRule } from './egress';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

const iso = (ms: number | null | undefined): string | null => (ms == null ? null : new Date(ms).toISOString());

/** Pure: map a runtime RunPatch to an erp_workflow_instances column patch. */
export function mapRunPatch(patch: RunPatch, stepNoById: Map<string, number>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.status !== undefined) {
    // active runtime states keep engine status 'pending' (preserve active guard);
    // terminal states map to engine-compatible values.
    const map: Record<string, { status: string; terminal: boolean }> = {
      running: { status: 'pending', terminal: false },
      waiting: { status: 'pending', terminal: false },
      completed: { status: 'approved', terminal: true },
      rejected: { status: 'rejected', terminal: true },
      failed: { status: 'cancelled', terminal: true },
    };
    const m = map[patch.status];
    if (m) {
      out.status = m.status;
      out.runtime_state = patch.status;
      if (m.terminal && patch.completedAt === undefined) out.completed_at = new Date().toISOString();
    }
  }
  if (patch.currentStepId !== undefined) {
    out.current_step_id = patch.currentStepId;
    const no = patch.currentStepId ? stepNoById.get(patch.currentStepId) : undefined;
    if (no !== undefined) out.current_step = no;                  // keep legacy int in sync
  }
  if (patch.nextActionAt !== undefined) out.next_action_at = iso(patch.nextActionAt);
  if (patch.attempts !== undefined) out.attempts = patch.attempts;
  if (patch.lastError !== undefined) out.last_error = patch.lastError;
  if (patch.completedAt !== undefined) out.completed_at = iso(patch.completedAt);
  return out;
}

function applyPatchToRun(run: RunState, patch: RunPatch): RunState {
  return {
    ...run,
    currentStepId: patch.currentStepId !== undefined ? patch.currentStepId : run.currentStepId,
    attempts: patch.attempts ?? run.attempts,
    context: patch.context ?? run.context,
  };
}

export interface RuntimeDepsOpts { companyId: string; actorId: string | null; stepNoById: Map<string, number> }

export function makeRuntimeDeps(db: Db, opts: RuntimeDepsOpts): RuntimeDeps {
  const exec: ExecutorDeps = {
    now: () => Date.now(),

    async ensureApprovalTask(run, step) {
      // Reuse the engine's task table; create one only if none is pending.
      const { data: existing } = await db.from('erp_workflow_tasks' as never)
        .select('id').eq('instance_id', run.id).eq('step_no', step.stepNo).eq('status', 'pending').maybeSingle();
      if (existing) return;
      await db.from('erp_workflow_tasks' as never).insert({
        company_id: run.companyId, instance_id: run.id, step_no: step.stepNo, branch_id: run.branchId,
        assignee_type: step.approverType ?? 'company_admin', assignee_ref: step.approverRef,
        due_at: step.slaHours != null ? new Date(Date.now() + step.slaHours * 3600_000).toISOString() : null,
      } as never);
    },

    async approvalDecision(run, step) {
      const { data } = await db.from('erp_workflow_tasks' as never)
        .select('status').eq('instance_id', run.id).eq('step_no', step.stepNo)
        .in('status', ['approved', 'rejected']).order('decided_at', { ascending: false }).limit(1).maybeSingle();
      const s = (data as { status?: string } | null)?.status;
      return s === 'approved' || s === 'rejected' ? s : null;
    },

    async notify({ run, channel, template, to, vars }) {
      // Future: route through Notification OS. Now: record intent on the event bus.
      await emitEvent(db, {
        companyId: run.companyId, branchId: run.branchId, source: 'workflow', actorId: run.actorId,
        eventType: 'workflow.notification.sent', entity: 'workflow_run', recordId: run.id,
        payload: { channel, template, to, vars },
      });
    },

    async createTask({ run, title, assigneeType, assigneeRef, dueAt }) {
      const { data } = await db.from('erp_workflow_tasks' as never).insert({
        company_id: run.companyId, instance_id: run.id, step_no: 0, branch_id: run.branchId,
        assignee_type: assigneeType, assignee_ref: assigneeRef,
        due_at: dueAt != null ? new Date(dueAt).toISOString() : null, comment: title,
      } as never).select('id').single();
      return { taskId: (data as { id: string } | null)?.id ?? '' };
    },

    async updateRecord({ table, id, patch, companyId }) {
      if (!UPDATE_RECORD_ALLOWLIST.has(table)) throw new Error(`update_record: table '${table}' not allow-listed`);
      const { error } = await db.from(table as never).update(patch as never).eq('id', id);
      if (error) throw new Error(error.message);
      void companyId; // tenant already enforced by RLS under the impersonated client
    },

    async httpCall({ method, url, headers, body, connector }) {
      // Egress allow-list (Phase A): approved domains + connectors only, per company.
      const host = hostFromUrl(url);
      const { data: ruleRows } = await db.from('erp_workflow_egress_rules' as never)
        .select('domain,connector_key,is_active').eq('company_id', opts.companyId).eq('is_active', true);
      const rules: EgressRule[] = ((ruleRows ?? []) as Record<string, unknown>[])
        .map((r) => ({ domain: String(r.domain), connectorKey: (r.connector_key as string) ?? null, isActive: true }));
      if (!isEgressAllowed(host, connector ?? null, rules)) {
        await emitEvent(db, {
          companyId: opts.companyId, source: 'workflow', actorId: opts.actorId,
          eventType: 'workflow.egress.denied', entity: 'workflow_api_call', recordId: null,
          payload: { host, connector: connector ?? null, url },
        }).catch(() => {});
        return { status: 403, body: { error: 'egress_denied', host } }; // → api_call executor: failed, non-retryable
      }
      const res = await fetch(url, {
        method, headers: { 'content-type': 'application/json', ...(headers ?? {}) },
        body: body != null && method !== 'GET' ? JSON.stringify(body) : undefined,
      });
      let parsed: unknown = null;
      try { parsed = await res.json(); } catch { /* non-JSON body */ }
      return { status: res.status, body: parsed };
    },

    async escalate(run, step) {
      await emitEvent(db, {
        companyId: run.companyId, branchId: run.branchId, source: 'workflow', actorId: run.actorId,
        eventType: 'workflow.escalated', entity: 'workflow_run', recordId: run.id,
        payload: { step_id: step.id, escalate_to: step.escalateTo ?? step.config.escalate_to ?? null },
      });
    },

    evalCondition: (cond, vars) => evalCondition(cond, vars),

    async audit({ run, step, result }) {
      await emitEvent(db, {
        companyId: run.companyId, branchId: run.branchId, source: 'workflow', actorId: run.actorId,
        eventType: `workflow.step.${result.status}`, entity: 'workflow_step', recordId: step.id,
        payload: { run_id: run.id, step_no: step.stepNo, step_type: step.stepType, error: result.error ?? null },
      });
    },
  };

  return {
    exec,
    async persist(run, patch) {
      const dbPatch = mapRunPatch(patch, opts.stepNoById);
      if (Object.keys(dbPatch).length > 0) {
        const { error } = await db.from('erp_workflow_instances' as never).update(dbPatch as never).eq('id', run.id);
        if (error) throw new Error(error.message);
      }
      return applyPatchToRun(run, patch);
    },
  };
}
