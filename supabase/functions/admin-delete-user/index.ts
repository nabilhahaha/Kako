// POST { id }
// Hard-deletes an auth user. RLS cascade removes the profile.
// Recommended path is to deactivate via admin-update-user instead.

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { adminClient, requireRoshenManager } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const caller = await requireRoshenManager(req);
    const { id } = await req.json();
    if (!id) return jsonResponse({ error: 'id required' }, 400);
    if (id === caller.id) {
      return jsonResponse({ error: 'cannot delete yourself' }, 400);
    }

    const admin = adminClient();
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return jsonResponse({ error: error.message }, 400);
    return jsonResponse({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
