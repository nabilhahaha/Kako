// Edge Function: admin-create-user
// Creates a new auth user (with a profile via the DB trigger) on behalf of a
// super admin. Requires the service role key, which stays server-side here.
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
      .select('is_super_admin')
      .eq('id', caller.id)
      .single();

    if (!callerProfile?.is_super_admin) {
      return json({ error: 'هذه العملية متاحة لمدير النظام فقط' }, 403);
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
