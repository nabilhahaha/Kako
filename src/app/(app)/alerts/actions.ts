'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth, type ActionResult } from '@/lib/erp/guards';
import { logAudit } from '@/lib/erp/audit';
import { ALERTS_ENABLED, canTransitionAlert, clampSnoozeHours } from '@/lib/alerts';
import type { AlertStatus } from '@/lib/alerts';

// Alert lifecycle actions (acknowledge / snooze / resolve). Each runs as the user
// (RLS scopes to their company), validates the transition from the alert's current
// status, applies it, and audits. Flag-gated.

async function transition(
  id: string,
  to: AlertStatus,
  patch: Record<string, unknown>,
  action: string,
  details: Record<string, unknown> = {},
): Promise<ActionResult> {
  if (!ALERTS_ENABLED()) return { ok: false, error: 'disabled' };
  const { ctx } = await requireAuth();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  if (!ctx.companyId) return { ok: false, error: 'no_company' };
  if (!id) return { ok: false, error: 'missing' };

  const supabase = await createClient();
  const { data: cur } = await supabase.from('erp_alerts').select('id, status').eq('id', id).maybeSingle();
  if (!cur) return { ok: false, error: 'not_found' };
  const from = (cur as { status: AlertStatus }).status;
  if (!canTransitionAlert(from, to)) return { ok: false, error: 'invalid_transition' };

  const { error } = await supabase.from('erp_alerts').update(patch).eq('id', id);
  if (error) return { ok: false, error: error.message };

  await logAudit(supabase, { action, entity: 'alert', entityId: id, companyId: ctx.companyId, details: { from, to, ...details } });
  return { ok: true };
}

/** Acknowledge an alert (open/snoozed → acknowledged). */
export async function acknowledgeAlert(id: string): Promise<ActionResult> {
  const { ctx } = await requireAuth();
  return transition(id, 'acknowledged', {
    status: 'acknowledged', acknowledged_by: ctx?.userId ?? null, acknowledged_at: new Date().toISOString(),
  }, 'alert.acknowledge');
}

/** Snooze an alert until now + hours (open/acknowledged → snoozed). */
export async function snoozeAlert(id: string, hours?: number): Promise<ActionResult> {
  const h = clampSnoozeHours(Number(hours), 24);
  const until = new Date(Date.now() + h * 3_600_000).toISOString();
  return transition(id, 'snoozed', { status: 'snoozed', snoozed_until: until }, 'alert.snooze', { hours: h, snoozed_until: until });
}

/** Resolve an alert manually (any non-terminal → resolved). */
export async function resolveAlert(id: string, reason?: string): Promise<ActionResult> {
  const { ctx } = await requireAuth();
  return transition(id, 'resolved', {
    status: 'resolved', resolved_by: ctx?.userId ?? null, resolved_at: new Date().toISOString(),
    resolved_reason: reason?.trim() || 'manual',
  }, 'alert.resolve', { reason: reason?.trim() || 'manual' });
}
