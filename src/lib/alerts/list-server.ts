import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AlertSeverity, AlertStatus } from './types';

// Read model for the alerts UI. RLS-scoped to the caller's company.

export interface AlertRow {
  id: string;
  ruleKey: string;
  sourceKey: string;
  severity: AlertSeverity;
  status: AlertStatus;
  entity: string | null;
  recordId: string | null;
  title: string | null;
  body: string | null;
  createdAt: string;
  snoozedUntil: string | null;
}

/** The company's alerts, most severe + newest first. By default hides resolved. */
export async function loadAlerts(
  supabase: SupabaseClient,
  opts: { includeResolved?: boolean; limit?: number } = {},
): Promise<AlertRow[]> {
  let q = supabase
    .from('erp_alerts')
    .select('id, rule_key, source_key, severity, status, entity, record_id, title, body, created_at, snoozed_until')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 200);
  if (!opts.includeResolved) q = q.neq('status', 'resolved');
  const { data } = await q;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    ruleKey: String(r.rule_key),
    sourceKey: String(r.source_key),
    severity: r.severity as AlertSeverity,
    status: r.status as AlertStatus,
    entity: (r.entity as string) ?? null,
    recordId: (r.record_id as string) ?? null,
    title: (r.title as string) ?? null,
    body: (r.body as string) ?? null,
    createdAt: String(r.created_at),
    snoozedUntil: (r.snoozed_until as string) ?? null,
  }));
}
