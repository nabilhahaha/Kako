// ============================================================================
// Hardened user impersonation for the reconciliation worker.
//
// The audited money-path RPCs (erp_issue_invoice, erp_record_payment) gate on
// auth.uid() for branch authorization and stamp created_by on stock movements,
// so to reconcile an offline order through the EXACT same audited logic the
// worker must act AS the cashier who made the sale (captured as `created_by`).
// This is strictly safer than a service-role bypass (RLS still applies).
//
// Security controls (financial integrity):
//   • Short-lived  — 60s TTL; a token outlives only the single RPC sequence.
//   • Rotated      — a fresh token with a unique jti is minted per operation;
//                    nothing is cached or reused.
//   • Scoped       — iss/purpose claims mark the token as a reconcile-only grant.
//   • Audited      — every mint is logged (impersonated user, entity/pk, jti,
//                    issued/expires) to sync_impersonation_log; the unique jti is
//                    the replay-detection guard.
//   • Fail-closed  — no SUPABASE_JWT_SECRET → throw (record stays retriable);
//                    expired tokens are rejected by PostgREST → auth.uid() null →
//                    branch access denied → no write.
// The raw token is never logged or returned to callers — only its metadata.
// ============================================================================

import crypto from 'node:crypto';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config';

export const RECONCILE_TOKEN_TTL_SECONDS = 60;
const NBF_SKEW_SECONDS = 5;        // small clock-skew allowance
export const RECONCILE_TOKEN_PURPOSE = 'reconcile-offline-order';

const b64url = (s: string) => Buffer.from(s).toString('base64url');

function signHs256(payload: Record<string, unknown>, secret: string): string {
  const data = `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(JSON.stringify(payload))}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export interface MintedToken {
  token: string; jti: string; sub: string; issuedAt: number; expiresAt: number;
}

/**
 * Mint a short-lived, single-use reconcile JWT for `userId`. Pure + deterministic
 * given (userId, now, jti) — unit-testable without a database. `now`/`jti` are
 * injectable only for tests; production uses the real clock + a random uuid.
 */
export function mintReconcileToken(
  userId: string,
  opts: { secret?: string; now?: number; jti?: string } = {},
): MintedToken {
  const secret = opts.secret ?? process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error('SUPABASE_JWT_SECRET not configured — cannot reconcile offline orders');
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const jti = opts.jti ?? crypto.randomUUID();
  const exp = now + RECONCILE_TOKEN_TTL_SECONDS;
  const token = signHs256({
    sub: userId, role: 'authenticated', aud: 'authenticated', iss: 'kako-reconcile',
    purpose: RECONCILE_TOKEN_PURPOSE, iat: now, nbf: now - NBF_SKEW_SECONDS, exp, jti,
  }, secret);
  return { token, jti, sub: userId, issuedAt: now, expiresAt: exp };
}

function clientForToken(token: string): SupabaseClient {
  return createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

export interface ImpersonationContext { userId: string; companyId: string; entity: string; pk: string }

/**
 * Mint + audit-log + return a client acting AS the originating user. The audit
 * row is written before the token is used, so every impersonation is recorded
 * even if the subsequent materialization fails.
 */
export async function createImpersonatedClient(db: Db, ctx: ImpersonationContext): Promise<SupabaseClient> {
  const minted = mintReconcileToken(ctx.userId);
  const { error } = await db.from('sync_impersonation_log' as never).insert({
    company_id: ctx.companyId, impersonated_user: ctx.userId, entity: ctx.entity, pk: ctx.pk,
    jti: minted.jti, purpose: RECONCILE_TOKEN_PURPOSE,
    issued_at: new Date(minted.issuedAt * 1000).toISOString(),
    expires_at: new Date(minted.expiresAt * 1000).toISOString(),
  } as never);
  if (error) throw new Error(`impersonation audit failed: ${error.message}`); // fail-closed: no audit, no act
  return clientForToken(minted.token);
}
