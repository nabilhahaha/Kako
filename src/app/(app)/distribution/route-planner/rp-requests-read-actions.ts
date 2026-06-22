'use server';

// ============================================================================
// Phase C3 — read-only Route Planner request center. Company-scoped READS over
// erp_route_planner_requests (RLS-enforced). No writes: submitting/approving requests
// drives the approval state machine and is deferred to a later, reported phase.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export const RP_REQUEST_TYPES = ['new_customer', 'update', 'temp_stop', 'perm_stop', 'reassignment', 'location_fix', 'route_change'] as const;
export type RpRequestType = (typeof RP_REQUEST_TYPES)[number];
export const RP_REQUEST_STATUSES = ['created', 'pending_manager_review', 'approved', 'pending_admin_action', 'implemented_externally', 'closed', 'rejected', 'need_more_info', 'cancelled'] as const;
export type RpRequestStatus = (typeof RP_REQUEST_STATUSES)[number];

export interface RequestRow {
  id: string;
  ticketNo: string | null;
  type: RpRequestType;
  customerRef: string | null;
  status: RpRequestStatus;
  currentStage: string | null;
  reason: string | null;
  createdAt: string;
}

export interface RequestCenter {
  rows: RequestRow[];
  openCount: number;   // not closed/rejected/cancelled/implemented
}

const OPEN = new Set(['created', 'pending_manager_review', 'approved', 'pending_admin_action', 'need_more_info']);

export async function getRequestCenter(): Promise<Result<RequestCenter>> {
  const ctx = await getUserContext();
  if (!ctx?.companyId) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data, error } = await sb.from('erp_route_planner_requests')
    .select('id, ticket_no, type, customer_ref, status, current_stage, reason, created_at')
    .eq('company_id', ctx.companyId)
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) return { ok: false, error: error.message };
  const rows: RequestRow[] = (data ?? []).map((r) => ({
    id: r.id as string,
    ticketNo: (r.ticket_no as string | null) ?? null,
    type: r.type as RpRequestType,
    customerRef: (r.customer_ref as string | null) ?? null,
    status: r.status as RpRequestStatus,
    currentStage: (r.current_stage as string | null) ?? null,
    reason: (r.reason as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
  const openCount = rows.filter((r) => OPEN.has(r.status)).length;
  return { ok: true, data: { rows, openCount } };
}
