import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';
import { offlineLogin, offlineSetPassword } from '@/lib/offline/auth';
import { verifyToken } from '@/lib/offline/jwt';

/**
 * Phase P3 — offline local auth, end-to-end against the real schema:
 *   credential (erp_local_login, bcrypt-in-DB) → Supabase-shaped JWT → the SAME
 *   RLS the cloud uses (auth.uid() + erp_user_company_id()).
 * Gated on TEST_DATABASE_URL (run against an offline-booted or branch DB).
 */
const SECRET = 'integration-test-secret-at-least-32-bytes-long-xx';

async function seedUser(c: Parameters<Parameters<typeof withRollback>[0]>[0], opts: { email: string; password: string; companyName: string; btype?: string }) {
  const userId = randomUUID();
  const companyId = randomUUID();
  const branchId = randomUUID();
  await c.query(
    `INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data, email_confirmed_at)
     VALUES ($1, $2, 'authenticated', 'authenticated', jsonb_build_object('full_name','Admin'), now())`,
    [userId, opts.email],
  );
  await c.query(`INSERT INTO erp_companies (id, name, business_type, is_active) VALUES ($1, $2, $3, true)`, [companyId, opts.companyName, opts.btype ?? 'clothing']);
  await c.query(`INSERT INTO erp_branches (id, company_id, code, name, is_hq, is_active) VALUES ($1, $2, 'MAIN', 'Main', true, true)`, [branchId, companyId]);
  await c.query(`INSERT INTO erp_user_branches (user_id, branch_id, role, is_default) VALUES ($1, $2, 'owner', true)`, [userId, branchId]);
  await c.query(
    `INSERT INTO erp_local_users (id, email, password_hash, company_id, is_active)
     VALUES ($1, $2, extensions.crypt($3, extensions.gen_salt('bf')), $4, true)`,
    [userId, opts.email, opts.password, companyId],
  );
  return { userId, companyId };
}

describe.skipIf(!hasTestDb)('offline auth · login → JWT → RLS', () => {
  it('valid credentials mint a verifiable, Supabase-shaped token', async () => {
    await withRollback(async (c) => {
      const { userId, companyId } = await seedUser(c, { email: 'owner@store.local', password: 'secret-pw', companyName: 'Store A' });
      const session = await offlineLogin(c, 'owner@store.local', 'secret-pw', { secret: SECRET });
      expect(session).not.toBeNull();
      expect(session!.user.id).toBe(userId);
      expect(session!.user.companyId).toBe(companyId);

      const v = verifyToken(SECRET, session!.token);
      expect(v.ok).toBe(true);
      if (v.ok) {
        expect(v.claims.sub).toBe(userId);
        expect(v.claims.role).toBe('authenticated');
        expect(v.claims.company_id).toBe(companyId);
      }
    });
  });

  it('the minted token drives RLS exactly like the cloud', async () => {
    await withRollback(async (c) => {
      const { userId, companyId } = await seedUser(c, { email: 'rls@store.local', password: 'pw', companyName: 'Store RLS' });
      const session = await offlineLogin(c, 'rls@store.local', 'pw', { secret: SECRET });
      expect(session).not.toBeNull();

      // Act as the authenticated user the token identifies.
      await actAs(c, session!.user.id);
      const company = await c.query('SELECT erp_user_company_id() AS cid');
      expect(company.rows[0].cid).toBe(companyId);
      const visible = await c.query('SELECT count(*)::int AS n FROM erp_companies WHERE id = erp_user_company_id()');
      expect(visible.rows[0].n).toBe(1);
      await resetRole(c);
      expect(userId).toBeTruthy();
    });
  });

  it('rejects wrong password and inactive accounts (no enumeration)', async () => {
    await withRollback(async (c) => {
      await seedUser(c, { email: 'who@store.local', password: 'right-pw', companyName: 'Store B' });
      expect(await offlineLogin(c, 'who@store.local', 'wrong-pw', { secret: SECRET })).toBeNull();
      expect(await offlineLogin(c, 'nobody@store.local', 'x', { secret: SECRET })).toBeNull();
      // Deactivate → login refused.
      await c.query("UPDATE erp_local_users SET is_active = false WHERE lower(email) = 'who@store.local'");
      expect(await offlineLogin(c, 'who@store.local', 'right-pw', { secret: SECRET })).toBeNull();
    });
  });

  it('admin password reset rotates the credential', async () => {
    await withRollback(async (c) => {
      const { userId } = await seedUser(c, { email: 'reset@store.local', password: 'old-pw', companyName: 'Store C' });
      await offlineSetPassword(c, userId, 'new-pw');
      expect(await offlineLogin(c, 'reset@store.local', 'old-pw', { secret: SECRET })).toBeNull();
      expect(await offlineLogin(c, 'reset@store.local', 'new-pw', { secret: SECRET })).not.toBeNull();
    });
  });

  it('tenant isolation: a user cannot see another company (single-tenant safety net)', async () => {
    await withRollback(async (c) => {
      const a = await seedUser(c, { email: 'a@x.local', password: 'pw', companyName: 'Company A' });
      const b = await seedUser(c, { email: 'b@y.local', password: 'pw', companyName: 'Company B' });
      const sessionA = await offlineLogin(c, 'a@x.local', 'pw', { secret: SECRET });
      await actAs(c, sessionA!.user.id);
      const rows = await c.query('SELECT id FROM erp_companies');
      const ids = rows.rows.map((r) => r.id);
      expect(ids).toContain(a.companyId);
      expect(ids).not.toContain(b.companyId);
      await resetRole(c);
    });
  });
});
