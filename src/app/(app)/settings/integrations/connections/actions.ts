'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { validateConnection, isKnownAdapter } from '@/lib/erp/connectors/registry';

/** ── Connections — management actions (RLS / user session) ─────────────────
 *  Create / list / update / test / rotate-secret / revoke external connections.
 *  Non-secret config in erp_integrations.config; the credential goes to Vault
 *  via guarded SECURITY DEFINER RPCs. Gated on integrations.manage. */

interface Result<T = unknown> { ok: boolean; error?: string; data?: T }

export interface ConnectionRow {
  id: string; name: string; kind: string; direction: string; adapter: string;
  config: Record<string, unknown>; hasSecret: boolean; isActive: boolean;
  lastTestAt: string | null; lastTestOk: boolean | null; lastTestMessage: string | null; createdAt: string;
}

async function guard() {
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null, error: 'unauthorized' as const };
  if (!hasPermission(ctx, 'integrations.manage')) return { ctx: null, error: 'unauthorized' as const };
  return { ctx, error: null };
}

export async function listConnections(): Promise<Result<ConnectionRow[]>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { data, error: e } = await supabase
    .from('erp_integrations')
    .select('id, name, kind, direction, adapter, config, secret_id, is_active, last_test_at, last_test_ok, last_test_message, created_at')
    .order('created_at', { ascending: false });
  if (e) return { ok: false, error: e.message };
  const rows = ((data as Record<string, unknown>[]) ?? []).map((r) => ({
    id: r.id as string, name: r.name as string, kind: r.kind as string, direction: r.direction as string,
    adapter: r.adapter as string, config: (r.config as Record<string, unknown>) ?? {},
    hasSecret: r.secret_id != null, isActive: r.is_active as boolean,
    lastTestAt: (r.last_test_at as string) ?? null, lastTestOk: (r.last_test_ok as boolean) ?? null,
    lastTestMessage: (r.last_test_message as string) ?? null, createdAt: r.created_at as string,
  }));
  return { ok: true, data: rows };
}

export async function createConnection(input: {
  name: string; kind: string; direction: string; adapter: string;
  config: Record<string, unknown>; secret?: string;
}): Promise<Result<{ id: string }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  if (!input.name.trim()) return { ok: false, error: 'name required' };
  if (!isKnownAdapter(input.adapter)) return { ok: false, error: 'unknown adapter' };
  const invalid = validateConnection(input.adapter, input.config);
  if (invalid) return { ok: false, error: invalid };

  const supabase = await createClient();
  const { data, error: e } = await supabase.rpc('erp_integration_create', {
    p_name: input.name.trim(), p_kind: input.kind, p_direction: input.direction,
    p_adapter: input.adapter, p_config: input.config, p_secret: input.secret ?? null,
  });
  if (e) return { ok: false, error: e.message };
  revalidatePath('/settings/integrations/connections');
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function updateConnection(id: string, config: Record<string, unknown> | null, isActive: boolean | null): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { error: e } = await supabase.rpc('erp_integration_update', { p_id: id, p_config: config, p_is_active: isActive });
  if (e) return { ok: false, error: e.message };
  revalidatePath('/settings/integrations/connections');
  return { ok: true };
}

export async function setConnectionSecret(id: string, secret: string): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  if (!secret.trim()) return { ok: false, error: 'secret required' };
  const supabase = await createClient();
  const { error: e } = await supabase.rpc('erp_integration_set_secret', { p_id: id, p_secret: secret });
  if (e) return { ok: false, error: e.message };
  revalidatePath('/settings/integrations/connections');
  return { ok: true };
}

export async function testConnection(id: string): Promise<Result<{ ok: boolean; message: string }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { data, error: e } = await supabase.rpc('erp_integration_test', { p_id: id });
  if (e) return { ok: false, error: e.message };
  revalidatePath('/settings/integrations/connections');
  return { ok: true, data: data as { ok: boolean; message: string } };
}

export async function revokeConnection(id: string): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { error: e } = await supabase.rpc('erp_integration_revoke', { p_id: id });
  if (e) return { ok: false, error: e.message };
  revalidatePath('/settings/integrations/connections');
  return { ok: true };
}
