import { describe, it, expect } from 'vitest';
import { hasTestDb, connect } from '../db';

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
});
