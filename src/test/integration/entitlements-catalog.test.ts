import { describe, it, expect } from 'vitest';
import { hasTestDb, withRollback } from '../db';

/**
 * Entitlement Engine — E2 catalog seed (0264). The global module catalog + engine
 * features are seeded and readable. Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('entitlements · catalog', () => {
  it('seeds the module catalog (core + engines) and engine features', async () => {
    await withRollback(async (c) => {
      const modules = (await c.query('select module_key, category from erp_modules order by sort')).rows;
      const keys = modules.map((m) => m.module_key);
      expect(keys).toEqual(expect.arrayContaining([
        'sales', 'inventory', 'van_sales', 'change_requests', 'critical_alerts',
        'route_management', 'trade_spend', 'merchandising',
      ]));
      // engines carry a platform_flag; core modules don't
      const vs = (await c.query("select category, platform_flag from erp_modules where module_key='van_sales'")).rows[0];
      expect(vs).toMatchObject({ category: 'engine', platform_flag: 'KAKO_VAN_SALES' });

      const feats = (await c.query("select count(*)::int n from erp_features where module_key='change_requests'")).rows[0].n;
      expect(Number(feats)).toBeGreaterThanOrEqual(3);
    });
  }, 30_000);
});
