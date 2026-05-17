// POST { id, full_name?, role?, salesman_name?, is_active?, email? }
// Updates the profile row. Roshen-Manager-only.

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { adminClient, requireRoshenManager } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const caller = await requireRoshenManager(req);
    const body = await req.json();
    const id = String(body.id || '');
    if (!id) return jsonResponse({ error: 'id required' }, 400);

    const patch: Record<string, unknown> = {};
    if (typeof body.full_name === 'string') patch.full_name = body.full_name.trim();
    if (typeof body.role === 'string') {
      if (!['salesman', 'trade_marketing', 'roshen_manager'].includes(body.role)) {
        return jsonResponse({ error: 'invalid role' }, 400);
      }
      patch.role = body.role;
      // Clear salesman_name if no longer a salesman.
      if (body.role !== 'salesman') patch.salesman_name = null;
    }
    if (typeof body.salesman_name === 'string' || body.salesman_name === null) {
      patch.salesman_name = body.salesman_name || null;
    }
    if (typeof body.is_active === 'boolean') {
      // Don't let an RM deactivate themselves — would lock the system.
      if (!body.is_active && id === caller.id) {
        return jsonResponse({ error: 'cannot deactivate yourself' }, 400);
      }
      patch.is_active = body.is_active;
    }

    const admin = adminClient();

    if (Object.keys(patch).length > 0) {
      const { error } = await admin.from('profiles').update(patch).eq('id', id);
      if (error) return jsonResponse({ error: error.message }, 400);
    }

    if (typeof body.email === 'string' && body.email.trim()) {
      const newEmail = body.email.trim().toLowerCase();
      const { error } = await admin.auth.admin.updateUserById(id, { email: newEmail, email_confirm: true });
      if (error) return jsonResponse({ error: error.message }, 400);
      await admin.from('profiles').update({ email: newEmail }).eq('id', id);
    }

    return jsonResponse({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
