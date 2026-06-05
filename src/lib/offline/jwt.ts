// ============================================================================
// Offline JWT — Supabase-shaped HS256 tokens (Phase P3)
// ----------------------------------------------------------------------------
// The offline edition replaces Supabase Auth with a local issuer. PostgREST (the
// local data gateway) verifies a JWT signed HS256 with a local secret — exactly
// the algorithm Supabase uses — so the token's `sub`/`role` claims drive
// `auth.uid()` and RLS unchanged.
//
// Implemented with node:crypto only (no new dependency). Server/script-side.
// ============================================================================

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SupabaseClaims {
  /** User id → becomes auth.uid(). */
  sub: string;
  /** Postgres role PostgREST switches to (always 'authenticated' for app users). */
  role: 'authenticated';
  /** Audience, matching Supabase's default. */
  aud?: string;
  /** Issued-at (seconds since epoch). */
  iat?: number;
  /** Expiry (seconds since epoch). */
  exp?: number;
  /** Company binding — convenience claim (RLS resolves company from the DB, not
   *  this claim, but it is handy for the app/session). */
  company_id?: string;
  email?: string;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlJson(obj: unknown): string {
  return b64url(JSON.stringify(obj));
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function sign(data: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(data).digest());
}

/** Mint a Supabase-shaped HS256 JWT. `ttlSeconds` defaults to 12h. */
export function mintToken(
  secret: string,
  claims: Omit<SupabaseClaims, 'iat' | 'exp' | 'role' | 'aud'> & Partial<Pick<SupabaseClaims, 'role' | 'aud'>>,
  ttlSeconds = 12 * 60 * 60,
  now: number = Math.floor(Date.now() / 1000),
): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload: SupabaseClaims = {
    aud: 'authenticated',
    role: 'authenticated',
    ...claims,
    iat: now,
    exp: now + ttlSeconds,
  };
  const head = b64urlJson(header);
  const body = b64urlJson(payload);
  const sig = sign(`${head}.${body}`, secret);
  return `${head}.${body}.${sig}`;
}

export type VerifyResult =
  | { ok: true; claims: SupabaseClaims }
  | { ok: false; reason: 'malformed' | 'bad-signature' | 'expired' };

/** Verify signature + expiry and return the claims. */
export function verifyToken(secret: string, token: string, now: number = Math.floor(Date.now() / 1000)): VerifyResult {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [head, body, sig] = parts;
  const expected = sign(`${head}.${body}`, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'bad-signature' };
  let claims: SupabaseClaims;
  try {
    claims = JSON.parse(fromB64url(body).toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof claims.exp === 'number' && now >= claims.exp) return { ok: false, reason: 'expired' };
  return { ok: true, claims };
}
