import { describe, it, expect } from 'vitest';
import { hasTestDb, connect } from '../db';

/**
 * Van Sales (0251) — per-tenant enablement table exists with company-scoped RLS
 * and safe defaults (disabled, count required, no negative stock, no auto-confirm).
 * Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('van-sales · settings schema', () => {
  it('table exists with RLS and a one-per-company unique', async () => {
    const c = await connect();
    try {
      const cls = await c.query(
        `SELECT relrowsecurity FROM pg_class WHERE relname='erp_van_sales_settings' AND relnamespace='public'::regnamespace`,
      );
      expect(cls.rows.length).toBe(1);
      expect(cls.rows[0].relrowsecurity).toBe(true);
      const uq = await c.query(
        `SELECT pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid='erp_van_sales_settings'::regclass AND contype='u'`,
      );
      expect(uq.rows.some((r) => r.def.toLowerCase().includes('company_id'))).toBe(true);
    } finally { await c.end().catch(() => {}); }
  });

  it('defaults are safe (disabled, count required, no negative, no auto-confirm)', async () => {
    const c = await connect();
    try {
      const co = (await c.query("insert into erp_companies(name) values('VSS') returning id")).rows[0].id;
      const row = (await c.query('insert into erp_van_sales_settings(company_id) values ($1) returning *', [co])).rows[0];
      expect(row.is_enabled).toBe(false);
      expect(row.require_physical_count_on_close).toBe(true);
      expect(row.allow_negative_van_stock).toBe(false);
      expect(row.auto_confirm_direct_load).toBe(false);
    } finally { await c.end().catch(() => {}); }
  });
});
