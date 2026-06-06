// ============================================================================
// Offline auth service (Phase P3)
// ----------------------------------------------------------------------------
// Logs a user in WITHOUT Supabase Auth: verifies the credential in the database
// (erp_local_login, bcrypt inside Postgres) and mints a Supabase-shaped JWT the
// local PostgREST gateway + RLS trust. Server/offline-side only.
//
// Decoupled from a concrete driver via the minimal `Queryable` interface so it
// works with node-postgres in the offline server and with the integration-test
// client unchanged.
// ============================================================================

import { mintToken } from './jwt';
import { jwtSecret } from './secrets';

/** Anything that can run a parameterized query (node-postgres Client/Pool, or
 *  the integration-test client). */
export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface OfflineUser {
  id: string;
  email: string;
  companyId: string | null;
  fullName: string | null;
}

export interface OfflineSession {
  token: string;
  user: OfflineUser;
}

export interface LoginOptions {
  /** Override the signing secret (tests/packaging). Defaults to the local secret. */
  secret?: string;
  /** Token TTL in seconds (default 12h). */
  ttlSeconds?: number;
  env?: Record<string, string | undefined>;
}

/** Verify email/password against the local store; on success mint a session JWT.
 *  Returns null for wrong credentials or an inactive account (no distinction —
 *  avoids account enumeration). */
export async function offlineLogin(
  db: Queryable,
  email: string,
  password: string,
  opts: LoginOptions = {},
): Promise<OfflineSession | null> {
  const { rows } = await db.query('SELECT user_id, company_id, email, full_name FROM erp_local_login($1, $2)', [email, password]);
  if (rows.length === 0) return null;

  const r = rows[0] as { user_id: string; company_id: string | null; email: string; full_name: string | null };
  const secret = opts.secret ?? jwtSecret(opts.env);
  const token = mintToken(
    secret,
    { sub: r.user_id, company_id: r.company_id ?? undefined, email: r.email },
    opts.ttlSeconds ?? 12 * 60 * 60,
  );

  return {
    token,
    user: { id: r.user_id, email: r.email, companyId: r.company_id, fullName: r.full_name },
  };
}

/** Admin-driven password set/reset (offline has no email-based reset). */
export async function offlineSetPassword(db: Queryable, userId: string, newPassword: string): Promise<void> {
  await db.query('SELECT erp_local_set_password($1, $2)', [userId, newPassword]);
}
