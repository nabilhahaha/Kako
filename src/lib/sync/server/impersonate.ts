// ============================================================================
// User-scoped Supabase client for the reconciliation worker.
//
// The audited money-path RPCs (erp_issue_invoice, erp_record_payment) gate on
// auth.uid() for branch authorization AND stamp created_by on stock movements.
// To reconcile an offline order through the EXACT same audited logic — same
// authority, same RLS, same audit attribution — the worker acts AS the cashier
// who made the sale (captured as `created_by` in the offline payload) by minting
// a short-lived JWT signed with the project JWT secret. This is strictly safer
// than a service-role bypass: RLS still applies, and a user can only ever
// materialize sales for branches they were authorized for.
//
// Requires SUPABASE_JWT_SECRET. Behind KAKO_SYNC; if unset, reconciliation of
// orders fails closed (records stay retriable) — never writes wrong data.
// ============================================================================

import crypto from 'node:crypto';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config';

const b64url = (s: string) => Buffer.from(s).toString('base64url');

function signHs256(payload: Record<string, unknown>, secret: string): string {
  const data = `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(JSON.stringify(payload))}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

/** A Supabase client where PostgREST sees auth.uid() === userId. */
export function createUserScopedClient(userId: string): SupabaseClient {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error('SUPABASE_JWT_SECRET not configured — cannot reconcile offline orders');
  const now = Math.floor(Date.now() / 1000);
  const token = signHs256({ sub: userId, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 600 }, secret);
  return createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
