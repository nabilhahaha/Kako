import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChangeRequestStatus, ChangeRequestScope } from './types';

// Read models for the Change Request surfaces. All queries are RLS-scoped to the
// caller's company; no service role.

export interface ChangeRequestRow {
  id: string;
  entityKey: string;
  scope: ChangeRequestScope;
  status: ChangeRequestStatus;
  reason: string | null;
  effectiveAt: string | null;
  requestedBy: string | null;
  createdAt: string;
  targetCount: number;
}

export interface ChangeRequestDetail extends ChangeRequestRow {
  targets: { targetId: string; status: string; error: string | null }[];
  values: { fieldKey: string; oldValue: unknown; newValue: unknown; targetId: string | null }[];
}

function summaryCount(summary: unknown): number {
  const s = summary as { targets?: number } | null;
  return typeof s?.targets === 'number' ? s.targets : 0;
}

/** The company's change requests, newest first. */
export async function loadChangeRequests(supabase: SupabaseClient, limit = 100): Promise<ChangeRequestRow[]> {
  const { data } = await supabase
    .from('erp_change_requests')
    .select('id, entity_key, scope, status, reason, effective_at, requested_by, created_at, summary')
    .order('created_at', { ascending: false })
    .limit(limit);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    entityKey: String(r.entity_key),
    scope: r.scope as ChangeRequestScope,
    status: r.status as ChangeRequestStatus,
    reason: (r.reason as string) ?? null,
    effectiveAt: (r.effective_at as string) ?? null,
    requestedBy: (r.requested_by as string) ?? null,
    createdAt: String(r.created_at),
    targetCount: summaryCount(r.summary),
  }));
}

/** One change request with its targets + proposed/applied field changes. */
export async function loadChangeRequestDetail(supabase: SupabaseClient, id: string): Promise<ChangeRequestDetail | null> {
  const { data: head } = await supabase
    .from('erp_change_requests')
    .select('id, entity_key, scope, status, reason, effective_at, requested_by, created_at, summary')
    .eq('id', id)
    .maybeSingle();
  if (!head) return null;
  const r = head as Record<string, unknown>;

  const { data: targets } = await supabase
    .from('erp_change_request_targets')
    .select('target_id, status, error')
    .eq('request_id', id);
  const { data: values } = await supabase
    .from('erp_change_request_values')
    .select('field_key, old_value, new_value, target_id')
    .eq('request_id', id);

  return {
    id: String(r.id),
    entityKey: String(r.entity_key),
    scope: r.scope as ChangeRequestScope,
    status: r.status as ChangeRequestStatus,
    reason: (r.reason as string) ?? null,
    effectiveAt: (r.effective_at as string) ?? null,
    requestedBy: (r.requested_by as string) ?? null,
    createdAt: String(r.created_at),
    targetCount: summaryCount(r.summary),
    targets: ((targets ?? []) as Record<string, unknown>[]).map((t) => ({
      targetId: String(t.target_id), status: String(t.status), error: (t.error as string) ?? null,
    })),
    values: ((values ?? []) as Record<string, unknown>[]).map((v) => ({
      fieldKey: String(v.field_key), oldValue: v.old_value, newValue: v.new_value, targetId: (v.target_id as string) ?? null,
    })),
  };
}
