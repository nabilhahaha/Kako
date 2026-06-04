'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { isValidScope } from '@/lib/erp/integration';

/** ── API Keys — management actions (RLS / user session) ────────────────────
 *  Create / list / revoke per-company API keys. All go through the user's
 *  RLS-scoped client; create + revoke use guarded SECURITY DEFINER RPCs
 *  (admin/owner enforced in-DB). Gated on integrations.manage. */

interface Result<T = unknown> { ok: boolean; error?: string; data?: T }

export interface ApiKeyRow {
  id: string; name: string; prefix: string; scopes: string[];
  isActive: boolean; lastUsedAt: string | null; createdAt: string; revokedAt: string | null;
}

async function guard() {
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null, error: 'unauthorized' as const };
  if (!hasPermission(ctx, 'integrations.manage')) return { ctx: null, error: 'unauthorized' as const };
  return { ctx, error: null };
}

export async function listApiKeys(): Promise<Result<ApiKeyRow[]>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  // NB: key_hash is intentionally never selected.
  const { data, error: e } = await supabase
    .from('erp_api_keys')
    .select('id, name, prefix, scopes, is_active, last_used_at, created_at, revoked_at')
    .order('created_at', { ascending: false });
  if (e) return { ok: false, error: e.message };
  const rows = ((data as Record<string, unknown>[]) ?? []).map((r) => ({
    id: r.id as string, name: r.name as string, prefix: r.prefix as string,
    scopes: (r.scopes as string[]) ?? [], isActive: r.is_active as boolean,
    lastUsedAt: (r.last_used_at as string) ?? null, createdAt: r.created_at as string,
    revokedAt: (r.revoked_at as string) ?? null,
  }));
  return { ok: true, data: rows };
}

export async function createApiKey(
  name: string, scopes: string[],
): Promise<Result<{ id: string; prefix: string; apiKey: string }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  if (!name.trim()) return { ok: false, error: 'name required' };
  if (!scopes || scopes.length === 0) return { ok: false, error: 'select at least one scope' };
  if (scopes.some((s) => !isValidScope(s))) return { ok: false, error: 'invalid scope' };

  const supabase = await createClient();
  const { data, error: e } = await supabase.rpc('erp_api_key_create', {
    p_name: name.trim(), p_scopes: scopes,
  });
  if (e) return { ok: false, error: e.message };
  const d = data as { id: string; prefix: string; api_key: string };
  revalidatePath('/settings/integrations/api-keys');
  return { ok: true, data: { id: d.id, prefix: d.prefix, apiKey: d.api_key } };
}

export async function revokeApiKey(id: string): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { error: e } = await supabase.rpc('erp_api_key_revoke', { p_id: id });
  if (e) return { ok: false, error: e.message };
  revalidatePath('/settings/integrations/api-keys');
  return { ok: true };
}
