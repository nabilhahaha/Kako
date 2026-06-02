// Edge Function: admin-set-user-active
// Enables/disables an auth user's LOGIN (offboarding). Banning prevents new
// tokens and refreshes; combined with the short access-token TTL this disables
// active sessions. The service role key stays server-side here and is never
// exposed to any in-app role. Customer/tenant DATA is never touched.
//
// Authorized callers: a Platform Owner, a global super admin, or an internal
// employee with the `manage_users` platform permission.
//
// Deploy:  supabase functions deploy admin-set-user-active
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY (auto).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization') ?? '';
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: 'unauthorized' }, 401);

    const { data: profile } = await callerClient
      .from('erp_profiles')
      .select('is_super_admin, is_platform_owner')
      .eq('id', caller.id)
      .single();
    let allowed = Boolean(profile?.is_super_admin || profile?.is_platform_owner);
    if (!allowed) {
      // manage_users platform staff may offboard. Checked via the DB resolver
      // (RLS/permission logic stays in one place).
      const { data: canManage } = await callerClient.rpc('erp_platform_has', { p_perm: 'manage_users' });
      allowed = Boolean(canManage);
    }
    if (!allowed) return json({ error: 'forbidden' }, 403);

    const body = await req.json();
    const userId = String(body.user_id ?? '').trim();
    const active = Boolean(body.active);
    if (!userId) return json({ error: 'user_id required' }, 400);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Ban (disable login + block token refresh) or lift the ban.
    const { error: banErr } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: active ? 'none' : '876000h', // ~100 years
    });
    if (banErr) return json({ error: banErr.message }, 400);

    // Best-effort: revoke existing refresh sessions immediately on disable.
    if (!active) {
      try { await admin.auth.admin.signOut(userId, 'global'); } catch (_e) { /* older SDKs: ban + TTL suffices */ }
    }

    return json({ ok: true, user_id: userId, active });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'error' }, 500);
  }
});
