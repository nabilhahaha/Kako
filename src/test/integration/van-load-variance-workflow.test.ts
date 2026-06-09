import { describe, it, expect } from 'vitest';
import { hasTestDb, connect } from '../db';

/**
 * Van Sales (0249) — the global van_load_variance review workflow is active,
 * globally visible, and event-triggered by 'van_load_variance.raised'. Chain:
 * Warehouse review → Supervisor approval → mark the confirmation reviewed (no
 * automatic stock/financial deduction). Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('van-sales · load variance review workflow', () => {
  it('global definition is active, visible, and event-triggered', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(
        `SELECT entity, is_active, visibility, trigger_event
           FROM erp_workflow_definitions
          WHERE key = 'van_load_variance' AND company_id IS NULL`,
      );
      expect(rows.length).toBe(1);
      expect(rows[0]).toMatchObject({ entity: 'van_load_variance', is_active: true, visibility: 'global', trigger_event: 'van_load_variance.raised' });
    } finally { await c.end().catch(() => {}); }
  });

  it('reviews warehouse → supervisor → resolves review_status', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(
        `SELECT s.step_no, s.step_type, s.approver_ref, s.config
           FROM erp_workflow_steps s
           JOIN erp_workflow_definitions d ON d.id = s.definition_id
          WHERE d.key = 'van_load_variance' AND d.company_id IS NULL
          ORDER BY s.step_no`,
      );
      expect(rows.length).toBe(3);
      expect(rows[0]).toMatchObject({ step_type: 'approval', approver_ref: 'warehouse_keeper' });
      expect(rows[1]).toMatchObject({ step_type: 'approval', approver_ref: 'supervisor' });
      expect(rows[2].step_type).toBe('update_record');
      expect(rows[2].config).toMatchObject({ table: 'erp_van_load_confirmations', patch: { review_status: 'approved' } });
    } finally { await c.end().catch(() => {}); }
  });
});
