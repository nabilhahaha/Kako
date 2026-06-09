import { describe, it, expect } from 'vitest';
import { hasTestDb, connect } from '../db';

/**
 * Van Sales (0248) — the global van_stock_request approval chain is active,
 * globally visible, event-triggered by 'van_stock_request.submitted', and its
 * apply step flips erp_stock_requests.status to 'approved'. Companies clone+edit
 * to insert Area-Manager / Warehouse steps. Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('van-sales · load-request approval chain', () => {
  it('global definition is active, visible, and event-triggered', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(
        `SELECT entity, is_active, visibility, trigger_event
           FROM erp_workflow_definitions
          WHERE key = 'van_stock_request' AND company_id IS NULL`,
      );
      expect(rows.length).toBe(1);
      expect(rows[0].entity).toBe('van_stock_request');
      expect(rows[0].is_active).toBe(true);
      expect(rows[0].visibility).toBe('global');
      expect(rows[0].trigger_event).toBe('van_stock_request.submitted');
    } finally { await c.end().catch(() => {}); }
  });

  it('the chain approves then flips the request status', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(
        `SELECT s.step_no, s.step_type, s.approver_ref, s.config
           FROM erp_workflow_steps s
           JOIN erp_workflow_definitions d ON d.id = s.definition_id
          WHERE d.key = 'van_stock_request' AND d.company_id IS NULL
          ORDER BY s.step_no`,
      );
      expect(rows.length).toBe(3);
      expect(rows[0]).toMatchObject({ step_type: 'approval', approver_ref: 'supervisor' });
      expect(rows[1].step_type).toBe('update_record');
      expect(rows[1].config).toMatchObject({ table: 'erp_stock_requests', patch: { status: 'approved' } });
      expect(rows[2].step_type).toBe('notification');
    } finally { await c.end().catch(() => {}); }
  });
});
