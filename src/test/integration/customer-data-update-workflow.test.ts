import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, connect, withRollback, actAs, resetRole } from '../db';
import { advanceRun, type RuntimeDeps } from '@/lib/workflow/runtime';
import type { ExecutorDeps, RunState, RuntimeStep } from '@/lib/workflow/executors/types';

/** Load the seeded GLOBAL customer_data_update definition's steps as RuntimeSteps. */
async function loadGlobalSteps(c: Client): Promise<{ definitionId: string; steps: RuntimeStep[] }> {
  const def = (await c.query(
    `SELECT id FROM erp_workflow_definitions WHERE key='customer_data_update' AND company_id IS NULL`,
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

/** RuntimeDeps backed by the test DB: updateRecord performs the REAL UPDATE (the
 *  exact governed write path), the approval decision is injected (the human
 *  approval), and persistence is in-memory. Everything else is a no-op. */
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
 * Customer Data Update — out-of-the-box workflow (0245). A single GLOBAL
 * (company_id IS NULL) definition is active, globally visible, and event-triggered
 * by 'customer_change_request.submitted', with the apply step reading the approved
 * change set from the run context. No per-tenant instantiation required.
 * Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('customer data update · global workflow', () => {
  it('global definition is active, visible, and event-triggered', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(
        `SELECT entity, is_active, visibility, trigger_event
           FROM erp_workflow_definitions
          WHERE key = 'customer_data_update' AND company_id IS NULL`,
      );
      expect(rows.length).toBe(1);
      expect(rows[0].entity).toBe('customer_change_request');
      expect(rows[0].is_active).toBe(true);
      expect(rows[0].visibility).toBe('global');
      expect(rows[0].trigger_event).toBe('customer_change_request.submitted');
    } finally { await c.end().catch(() => {}); }
  });

  it('apply step reads the change set from the run context (dynamic patch)', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(
        `SELECT s.step_no, s.step_type, s.config
           FROM erp_workflow_steps s
           JOIN erp_workflow_definitions d ON d.id = s.definition_id
          WHERE d.key = 'customer_data_update' AND d.company_id IS NULL
          ORDER BY s.step_no`,
      );
      expect(rows.length).toBe(4);
      const apply = rows.find((r) => r.step_no === 2);
      expect(apply.step_type).toBe('update_record');
      expect(apply.config).toMatchObject({
        table: 'erp_customers', patch_from_context: 'changes', id_from_context: 'customer_id',
      });
    } finally { await c.end().catch(() => {}); }
  });

  // FULL CHAIN: a real change request runs through the REAL runtime + the REAL
  // seeded steps. The apply is GATED on approval — pending → the customer is
  // untouched; approved → the change set is written to erp_customers and the
  // request is marked approved.
  it('approving a request applies the change set to the customer row', async () => {
    await withRollback(async (c) => {
      // Seed a tenant + a customer with the OLD values.
      const company = (await c.query("insert into erp_companies(name) values('CDU_E2E') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ','HQ') returning id", [company])).rows[0].id;
      const user = randomUUID();
      await c.query('insert into auth.users(id, email) values ($1,$2)', [user, `u+${user}@test.local`]);
      await c.query('insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,$3,true)', [user, branch, 'admin']);

      // Customer is created as owner with an explicit company (proven pattern);
      // the change request is created under the user (its trigger sets company_id).
      const customer = (await c.query(
        "insert into erp_customers(company_id,code,name,phone,national_address) values ($1,'E2E','E2E','OLD-PHONE','OLD-ADDR') returning id",
        [company],
      )).rows[0].id;
      const changes = { phone: 'NEW-PHONE', national_address: 'NEW-ADDR' };
      await actAs(c, user);
      const cr = (await c.query(
        "insert into erp_customer_change_requests(customer_id,changes,reason,requested_by) values ($1,$2,'moved',$3) returning id",
        [customer, JSON.stringify(changes), user],
      )).rows[0].id;
      await resetRole(c);

      const { definitionId, steps } = await loadGlobalSteps(c);
      const run: RunState = {
        id: randomUUID(), companyId: company, branchId: null, definitionId,
        entity: 'customer_change_request', recordId: cr, currentStepId: null,
        context: { customer_id: customer, changes }, attempts: 0, actorId: user,
      };

      // Pending approval → pauses at the approval step; nothing applied yet.
      const pending = await advanceRun(pgDeps(c, null), run, steps);
      expect(pending.state).toBe('awaiting_approval');
      const before = (await c.query('select phone, national_address from erp_customers where id=$1', [customer])).rows[0];
      expect(before.phone).toBe('OLD-PHONE');
      expect(before.national_address).toBe('OLD-ADDR');

      // Approved → the run resumes, applies the change set, and marks the request.
      const done = await advanceRun(pgDeps(c, 'approved'), pending.run, steps);
      expect(done.state).toBe('completed');
      const after = (await c.query('select phone, national_address from erp_customers where id=$1', [customer])).rows[0];
      expect(after.phone).toBe('NEW-PHONE');
      expect(after.national_address).toBe('NEW-ADDR');
      const crStatus = (await c.query('select status from erp_customer_change_requests where id=$1', [cr])).rows[0].status;
      expect(crStatus).toBe('approved');
    });
  }, 30_000);
});
