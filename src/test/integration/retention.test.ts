import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback } from '../db';

/**
 * 0119 — retention purge. erp_purge_old_data() removes READ notifications past
 * the window; keeps recent + unread. (Workflow purge shares the same window
 * logic.) Run as superuser in the harness (function is SECURITY DEFINER).
 */
describe.skipIf(!hasTestDb)('retention purge (0119)', () => {
  it('purges old read notifications; keeps recent + unread', async () => {
    await withRollback(async (c: Client) => {
      const co = (await c.query("insert into erp_companies(name) values ('RET') returning id")).rows[0].id;
      const uid = randomUUID();
      await c.query('insert into auth.users(id, email) values ($1,$2)', [uid, `u+${uid}@test.local`]);
      const mk = (days: number, read: boolean) =>
        c.query(
          "insert into erp_notifications(company_id, user_id, type, title_ar, is_read, created_at) values ($1,$2,'info','t',$3, now() - make_interval(days => $4))",
          [co, uid, read, days],
        );
      await mk(100, true);   // old + read   → purge
      await mk(10, true);    // recent + read → keep
      await mk(100, false);  // old + unread → keep

      const res = (await c.query('select * from erp_purge_old_data(90, 180)')).rows[0];
      expect(Number(res.notifications_deleted)).toBe(1);

      const left = (await c.query('select count(*)::int n from erp_notifications where company_id=$1', [co])).rows[0].n;
      expect(left).toBe(2); // recent-read + old-unread remain
    });
  }, 30_000);
});
