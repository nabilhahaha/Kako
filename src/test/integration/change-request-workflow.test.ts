import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, connect, withRollback, actAs, resetRole } from '../db';
import { advanceRun, type RuntimeDeps } from '@/lib/workflow/runtime';
import type { ExecutorDeps, RunState, RuntimeStep } from '@/lib/workflow/executors/types';

/** Load the seeded GLOBAL change_request:customer definition's steps. */
async function loadGlobalSteps(c: Client): Promise<{ definitionId: string; steps: RuntimeStep[] }> {
  const def = (await c.query(
    "SELECT id FROM erp_workflow_definitions WHERE key='change_request:customer' AND company_id IS NULL",
  )).rows[0];
  const rows = (await c.query(
    `SELECT id, step_no, step_type, name, config, approver_type, approver_ref, sla_hours, escalate_to, condition, next_on_success, next_on_failure
       FROM erp_workflow_steps WHERE definition_id=$1 ORDER BY step_no`, [def.id],
  )).rows;
  const steps: RuntimeStep[] = rows.map((r) => ({
    id: String(r.id), stepNo: Number(r.step_no), stepType: r.step_type, name: r.name,
    config: (r.config ?? {}) as Record<string, unknown>,
    approverType: r.approver_type, approverRef: r.approver_ref, slaHours: r.sla_hours, escalateTo: r.escalate_to,
    condition: r.condition, nextOnSuccess: r.next_on_success, nextOnFailure: r.next_on_failure,
  }));
  return { definitionId: String(def.id), steps };
}

/** RuntimeDeps backed by the test DB: updateRecord performs the REAL UPDATE; the
 *  approval decision is injected; persistence is in-memory (mirrors 0245's test). */
function pgDeps(c: Client, decision: 'approved' | 'rejected' | null): RuntimeDeps {
  const exec: ExecutorDeps = {
    now: () => Date.now(),
    ensureApprovalTask: async () => {},
    approvalDecision: async () => decision,
    notify: async () => {},
    createTask: async () => ({ taskId: randomUUID() }),
    updateRecord: async ({ table, id, patch }) => {
      const keys = Object.keys(patch);
      if (keys.length === 0) return;
      const set = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      await c.query(`UPDATE ${table} SET ${set} WHERE id = $${keys.length + 1}`, [...keys.map((k) => patch[k]), id]);
    },
    httpCall: async () => ({ status: 200, body: {} }),
    escalate: async () => {},
    evalCondition: () => true,
    audit: async () => {},
  };
  return {
    exec,
    persist: async (run, patch) => ({
      ...run,
      currentStepId: patch.currentStepId !== undefined ? patch.currentStepId : run.currentStepId,
      context: patch.context ?? run.context,
      attempts: patch.attempts ?? run.attempts,
    }),
  };
}

/**
 * Change Request engine — Phase 3: the customer approval workflow (0254). One
 * GLOBAL definition, event-triggered by `change_request.submitted` and selected
 * for this entity by the trigger_config payload filter. The approval gates the
 * status flip: pending → request stays `submitted`; approved → `approved`. The
 * master-data apply itself arrives in Phase 4. Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('change-requests · customer approval workflow', () => {
  it('global definition is active, globally visible, and selects the customer entity', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(
        `SELECT entity, is_active, visibility, trigger_event, trigger_config
           FROM erp_workflow_definitions
          WHERE key = 'change_request:customer' AND company_id IS NULL`,
      );
      expect(rows.length).toBe(1);
      expect(rows[0]).toMatchObject({ entity: 'change_request', is_active: true, visibility: 'global', trigger_event: 'change_request.submitted' });
      expect(rows[0].trigger_config).toMatchObject({ where: { entity_key: 'customer' } });
    } finally { await c.end().catch(() => {}); }
  });

  it('approval gates the status flip: pending untouched, approved → approved', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('CRW_E2E') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ','HQ') returning id", [company])).rows[0].id;
      const user = randomUUID();
      await c.query('insert into auth.users(id, email) values ($1,$2)', [user, `u+${user}@test.local`]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,'admin',true)", [user, branch]);

      // A submitted customer change request (the action's persisted shape).
      await actAs(c, user);
      const cr = (await c.query(
        "insert into erp_change_requests(entity_key,scope,status,requested_by) values ('customer','single','submitted',$1) returning id",
        [user],
      )).rows[0].id;
      await c.query("insert into erp_change_request_targets(request_id,target_id) values ($1,'cust-1')", [cr]);
      await resetRole(c);

      const { definitionId, steps } = await loadGlobalSteps(c);
      expect(steps.map((s) => s.stepType)).toEqual(['approval', 'update_record', 'notification']);
      const run: RunState = {
        id: randomUUID(), companyId: company, branchId: null, definitionId,
        entity: 'change_request', recordId: cr, currentStepId: null,
        context: { entity_key: 'customer', target_id: 'cust-1' }, attempts: 0, actorId: user,
      };

      // Pending approval → pauses; request still `submitted`.
      const pending = await advanceRun(pgDeps(c, null), run, steps);
      expect(pending.state).toBe('awaiting_approval');
      expect((await c.query('select status from erp_change_requests where id=$1', [cr])).rows[0].status).toBe('submitted');

      // Approved → resumes, flips the request to `approved`.
      const done = await advanceRun(pgDeps(c, 'approved'), pending.run, steps);
      expect(done.state).toBe('completed');
      expect((await c.query('select status from erp_change_requests where id=$1', [cr])).rows[0].status).toBe('approved');
    });
  }, 30_000);
});
