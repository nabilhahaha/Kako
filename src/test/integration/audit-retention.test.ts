import { describe, it, expect } from 'vitest';
import { hasTestDb, connect } from '../db';

/**
 * Audit log retention (0236) — the guarded purge function deletes rows older than
 * the window, keeps recent rows, and REFUSES a non-positive window so it can never
 * wipe the log. Service-role only. Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('audit retention · erp_purge_audit_logs', () => {
  it('deletes old rows, keeps recent, refuses window < 1', async () => {
    const c = await connect();
    const TAG = `rtest-${Date.now()}`;
    try {
      // One old row (100 days), one recent (1 day). Direct insert (superuser).
      await c.query(
        `INSERT INTO erp_audit_logs (action, entity, entity_id, created_at)
         VALUES ('test','retention',$1, now() - interval '100 days'),
                ('test','retention',$1, now() - interval '1 day')`,
        [TAG],
      );

      // Purge keeping 30 days → the 100-day row goes, the 1-day row stays.
      const purged = await c.query(`SELECT erp_purge_audit_logs(30) AS n`);
      expect(Number(purged.rows[0].n)).toBeGreaterThanOrEqual(1);

      const left = await c.query(`SELECT count(*)::int AS n FROM erp_audit_logs WHERE entity_id = $1`, [TAG]);
      expect(left.rows[0].n).toBe(1);

      // Safety: a non-positive window must raise (never wipe the log).
      await expect(c.query(`SELECT erp_purge_audit_logs(0)`)).rejects.toThrow();
    } finally {
      await c.query(`DELETE FROM erp_audit_logs WHERE entity_id = $1`, [TAG]).catch(() => {});
      await c.end().catch(() => {});
    }
  });
});
