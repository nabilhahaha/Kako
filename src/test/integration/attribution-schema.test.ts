import { describe, it, expect } from 'vitest';
import { hasTestDb, connect } from '../db';

/**
 * Commercial Attribution & Traceability (Phase 4+) — additive, flag-gated, INERT.
 * Verifies the attribution ledger exists with RLS + the full raw-data column set
 * (0220). FK-coverage + RLS-wrap enforced globally by schema-health. Gated on
 * TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('commercial-attribution · schema', () => {
  it('ledger exists with RLS', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT relrowsecurity FROM pg_class cl JOIN pg_namespace n ON n.oid=cl.relnamespace
        WHERE n.nspname='public' AND cl.relname='erp_commercial_attribution'`);
      expect(rows).toHaveLength(1);
      expect(rows[0].relrowsecurity).toBe(true);
    } finally { await c.end().catch(() => {}); }
  });

  it('exposes the full attribution raw-data column set', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='erp_commercial_attribution'
          AND column_name IN ('ref_type','ref_id','promotion_id','promotion_type','funding_source',
            'supplier_share','company_share','distributor_share','discount_amount','free_goods_qty',
            'incentive_program_id','incentive_amount','commission_rule_id','commission_amount',
            'return_impact_value','roi_impact','customer_id','salesman_id','supervisor_id','route_id',
            'channel','region_id','period')`);
      expect(rows.length).toBe(23);
    } finally { await c.end().catch(() => {}); }
  });

  it('ref_type CHECK covers invoice/invoice_line/return/promotion', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid='erp_commercial_attribution'::regclass AND contype='c'`);
      const defs = rows.map((r) => r.def).join(' ');
      for (const t of ['invoice', 'invoice_line', 'return', 'promotion']) expect(defs).toContain(`'${t}'`);
    } finally { await c.end().catch(() => {}); }
  });
});
