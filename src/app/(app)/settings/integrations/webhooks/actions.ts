'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { isValidEventKey, isValidWebhookUrl } from '@/lib/erp/webhooks';

/** ── Webhooks — management actions (RLS / user session) ────────────────────
 *  Create / list / revoke / send-test, plus a recent delivery view. Mutations
 *  go through guarded SECURITY DEFINER RPCs (admin/owner enforced in-DB).
 *  Gated on integrations.manage. */

interface Result<T = unknown> { ok: boolean; error?: string; data?: T }

export interface WebhookRow {
  id: string; name: string; url: string; events: string[];
  isActive: boolean; disabledReason: string | null; lastDeliveryAt: string | null; createdAt: string;
}
export interface DeliveryRow {
  id: string; webhookId: string; event: string; status: string; attempts: number;
  lastStatusCode: number | null; lastError: string | null; createdAt: string; deliveredAt: string | null;
}

async function guard() {
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null, error: 'unauthorized' as const };
  if (!hasPermission(ctx, 'integrations.manage')) return { ctx: null, error: 'unauthorized' as const };
  return { ctx, error: null };
}

export async function listWebhooks(): Promise<Result<{ hooks: WebhookRow[]; deliveries: DeliveryRow[] }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const [{ data: hooks, error: he }, { data: deliveries }] = await Promise.all([
    supabase.from('erp_webhooks')
      .select('id, name, url, events, is_active, disabled_reason, last_delivery_at, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('erp_webhook_deliveries')
      .select('id, webhook_id, event, status, attempts, last_status_code, last_error, created_at, delivered_at')
      .order('created_at', { ascending: false }).limit(50),
  ]);
  if (he) return { ok: false, error: he.message };
  return {
    ok: true,
    data: {
      hooks: ((hooks as Record<string, unknown>[]) ?? []).map((h) => ({
        id: h.id as string, name: h.name as string, url: h.url as string,
        events: (h.events as string[]) ?? [], isActive: h.is_active as boolean,
        disabledReason: (h.disabled_reason as string) ?? null,
        lastDeliveryAt: (h.last_delivery_at as string) ?? null, createdAt: h.created_at as string,
      })),
      deliveries: ((deliveries as Record<string, unknown>[]) ?? []).map((d) => ({
        id: d.id as string, webhookId: d.webhook_id as string, event: d.event as string,
        status: d.status as string, attempts: Number(d.attempts ?? 0),
        lastStatusCode: (d.last_status_code as number) ?? null, lastError: (d.last_error as string) ?? null,
        createdAt: d.created_at as string, deliveredAt: (d.delivered_at as string) ?? null,
      })),
    },
  };
}

export async function createWebhook(
  name: string, url: string, events: string[],
): Promise<Result<{ id: string; secret: string }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  if (!name.trim()) return { ok: false, error: 'name required' };
  if (!isValidWebhookUrl(url)) return { ok: false, error: 'url must be https' };
  if (!events || events.length === 0) return { ok: false, error: 'select at least one event' };
  if (events.some((e) => !isValidEventKey(e))) return { ok: false, error: 'invalid event' };

  const supabase = await createClient();
  const { data, error: e } = await supabase.rpc('erp_webhook_create', {
    p_name: name.trim(), p_url: url.trim(), p_events: events,
  });
  if (e) return { ok: false, error: e.message };
  const d = data as { id: string; secret: string };
  revalidatePath('/settings/integrations/webhooks');
  return { ok: true, data: { id: d.id, secret: d.secret } };
}

export async function revokeWebhook(id: string): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { error: e } = await supabase.rpc('erp_webhook_revoke', { p_id: id });
  if (e) return { ok: false, error: e.message };
  revalidatePath('/settings/integrations/webhooks');
  return { ok: true };
}

export async function sendTestWebhook(id: string): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { error: e } = await supabase.rpc('erp_webhook_send_test', { p_id: id });
  if (e) return { ok: false, error: e.message };
  revalidatePath('/settings/integrations/webhooks');
  return { ok: true };
}
