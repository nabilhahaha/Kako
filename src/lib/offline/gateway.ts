// ============================================================================
// Offline gateway helpers (Phase P1/P2 runtime wiring)
// ----------------------------------------------------------------------------
// When KAKO_OFFLINE is set, supabase-js is pointed at the local Next server
// (NEXT_PUBLIC_SUPABASE_URL = the app origin). These helpers back the routes
// that make the app origin speak the two protocols supabase-js expects:
//   • GoTrue  (/auth/v1/*)  — shaped from the local issuer (src/lib/offline/auth)
//   • PostgREST (/rest/v1/*) — reverse-proxied to the bundled PostgREST sidecar
//
// All offline routes 404 on the cloud build (gated by isOffline()), so adding
// them is additive and never changes cloud behavior.
// ============================================================================

import { isOffline, offlinePorts } from './runtime';
import { verifyToken, type SupabaseClaims } from './jwt';
import { jwtSecret } from './secrets';
import type { OfflineSession } from './auth';

/** GoTrue-shaped session body that supabase-js stores after a password grant. */
export interface GoTrueSession {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  expires_at: number;
  refresh_token: string;
  user: GoTrueUser;
}

export interface GoTrueUser {
  id: string;
  aud: 'authenticated';
  role: 'authenticated';
  email: string;
  app_metadata: { provider: 'offline'; company_id: string | null };
  user_metadata: { full_name: string | null };
  created_at: string;
}

const TTL_SECONDS = 12 * 60 * 60;

/** Build the GoTrue token response from a local login session. The
 *  refresh_token is the same signed JWT (re-mintable); supabase-js just stores
 *  and resends it, and the refresh route re-verifies + re-issues. */
export function gotrueSession(session: OfflineSession, now: number = Math.floor(Date.now() / 1000)): GoTrueSession {
  return {
    access_token: session.token,
    token_type: 'bearer',
    expires_in: TTL_SECONDS,
    expires_at: now + TTL_SECONDS,
    refresh_token: session.token,
    user: gotrueUser(session),
  };
}

export function gotrueUser(session: OfflineSession): GoTrueUser {
  return {
    id: session.user.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: session.user.email,
    app_metadata: { provider: 'offline', company_id: session.user.companyId },
    user_metadata: { full_name: session.user.fullName },
    created_at: new Date(0).toISOString(),
  };
}

/** Extract + verify the bearer token from an Authorization header. */
export function verifyBearer(authHeader: string | null, env: Record<string, string | undefined> = process.env): SupabaseClaims | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!m) return null;
  const res = verifyToken(jwtSecret(env), m[1]);
  return res.ok ? res.claims : null;
}

/** Base URL of the bundled PostgREST sidecar. */
export function postgrestBaseUrl(env: Record<string, string | undefined> = process.env): string {
  return env.KAKO_OFFLINE_PGRST_URL || `http://127.0.0.1:${offlinePorts(env).postgrest}`;
}

/** True when offline routes should serve; callers 404 otherwise. */
export function offlineRoutesEnabled(): boolean {
  return isOffline();
}
