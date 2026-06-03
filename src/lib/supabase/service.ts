import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseUrl } from './config';

/** Server-only service-role client for the inbound integration API (/api/v1).
 *
 *  The inbound caller authenticates with a VANTORA API key, NOT a Supabase JWT,
 *  so there is no user session to scope RLS. This client therefore runs with the
 *  service-role key (read from the runtime env — Vercel env var, NEVER the app
 *  DB, and NEVER NEXT_PUBLIC_*). Because it bypasses RLS, the route handler MUST:
 *    • take company_id ONLY from the resolved API key (never the request body),
 *    • set company_id explicitly on every write,
 *    • filter every read by company_id,
 *    • log every call to erp_integration_logs.
 *  Privileged identity resolution + logging go through service_role-only RPCs.
 *
 *  Throws if the key is not configured, so a misconfigured deploy fails closed
 *  (the public endpoint returns 503 rather than silently using anon). */
export function createServiceClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  // getSupabaseUrl() throws if NEXT_PUBLIC_SUPABASE_URL is unset → fails closed.
  return createSupabaseClient(getSupabaseUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
