// Edge Function: admin-create-user
// Creates a new auth user (with a profile via the DB trigger) on behalf of a
// super admin OR a company admin/manager. Requires the service role key, which
// stays server-side here. The new account has no access until the caller
// assigns it to a branch/role afterwards (RLS-scoped to the caller's company).
//
// Deploy:  supabase functions deploy admin-create-user
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
//          (SUPABASE_* are injected automatically in the Supabase platform.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 1. Verify the caller is an authenticated super admin.
    const authHeader = req.headers.get('Authorization') ?? '';
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: caller },
    } = await callerClient.auth.getUser();
    if (!caller) {
      return json({ error: 'غير مصرح' }, 401);
    }

    const { data: callerProfile } = await callerClient
      .from('erp_profiles')
      .select('is_super_admin, is_platform_owner')
      .eq('id', caller.id)
      .single();

    let allowed = Boolean(
      callerProfile?.is_super_admin || callerProfile?.is_platform_owner,
    );
    // A company admin/manager may also create staff for their own company.
    // (The new account gains access only once the caller assigns it to one of
    // their branches afterwards — which RLS scopes to the caller's company.)
    if (!allowed) {
      const { data: adminRoles } = await callerClient
        .from('erp_user_branches')
        .select('role')
        .eq('user_id', caller.id)
        .in('role', ['admin', 'manager']);
      allowed = Boolean(adminRoles && adminRoles.length > 0);
    }

    if (!allowed) {
      return json({ error: 'هذه العملية متاحة لمدير الشركة فقط' }, 403);
    }

    // 2. Create the user with the service role.
    const body = await req.json();
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const full_name = String(body.full_name ?? '').trim();

    if (!email || password.length < 6) {
      return json(
        { error: 'البريد الإلكتروني وكلمة مرور (٦ أحرف على الأقل) مطلوبان' },
        400,
      );
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });

    if (createErr) {
      return json({ error: createErr.message }, 400);
    }

    // 3. Ensure profile fields (trigger creates the row; we set the name).
    if (created.user) {
      await admin
        .from('erp_profiles')
        .update({ full_name: full_name || email })
        .eq('id', created.user.id);
    }

    return json({ ok: true, user_id: created.user?.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
