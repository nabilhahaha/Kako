// POST { email, password, full_name, role, salesman_name? }
// Roshen-Manager-only. Creates an auth user + profiles row in one shot.

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { adminClient, requireRoshenManager } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    await requireRoshenManager(req);

    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const fullName = String(body.full_name || '').trim();
    const role = String(body.role || '');
    const salesmanName = body.salesman_name ? String(body.salesman_name).trim() : null;

    if (!email || !password || !fullName || !role) {
      return jsonResponse({ error: 'email, password, full_name, role are required' }, 400);
    }
    if (!['salesman', 'trade_marketing', 'roshen_manager'].includes(role)) {
      return jsonResponse({ error: 'invalid role' }, 400);
    }
    if (password.length < 6) {
      return jsonResponse({ error: 'password must be at least 6 characters' }, 400);
    }

    const admin = adminClient();

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    });
    if (createErr) return jsonResponse({ error: createErr.message }, 400);

    const userId = created.user!.id;

    const { error: insertErr } = await admin.from('profiles').insert({
      id: userId,
      email,
      full_name: fullName,
      role,
      salesman_name: role === 'salesman' ? salesmanName : null,
      is_active: true,
    });
    if (insertErr) {
      // Roll back the auth user so we don't leave an orphan.
      await admin.auth.admin.deleteUser(userId);
      return jsonResponse({ error: insertErr.message }, 400);
    }

    return jsonResponse({ id: userId, email, full_name: fullName, role });
  } catch (e) {
    if (e instanceof Response) return e;
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
