// POST { id, new_password }
// Sets a new password for any user. Roshen-Manager-only.

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { adminClient, requireRoshenManager } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    await requireRoshenManager(req);
    const { id, new_password } = await req.json();
    if (!id || !new_password) {
      return jsonResponse({ error: 'id and new_password required' }, 400);
    }
    if (String(new_password).length < 6) {
      return jsonResponse({ error: 'password must be at least 6 characters' }, 400);
    }

    const admin = adminClient();
    const { error } = await admin.auth.admin.updateUserById(id, { password: new_password });
    if (error) return jsonResponse({ error: error.message }, 400);
    return jsonResponse({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
