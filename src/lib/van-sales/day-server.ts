import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { UserContext } from '@/lib/erp/auth-context';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { hasPermission } from '@/lib/erp/permissions';
import { today } from '@/lib/erp/work-session';
import type { VanDayState } from './day';
import { dayReopenEnabled } from './sell';

// ============================================================================
// Van Sales — read the salesman's current day state from the EXISTING work
// session (erp_work_sessions). Read-only: it never opens a session (that's the
// "Start Day" action, reusing the field flow). Interim mapping — the
// load-confirmation gate (load_pending → open) and the settlement gate (closing)
// land in Phase B / Phase E; for now an open session reads as `open`.
// ============================================================================

export interface VanDay {
  state: VanDayState;
  sessionId: string | null;
}

/** The current van-sales day state for the caller, derived from today's work
 *  session. No session → not_started; open session → open; closed → closed. */
export async function loadVanDayState(ctx: UserContext): Promise<VanDay> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_work_sessions')
    .select('id, status')
    .eq('salesman_id', ctx.userId)
    .eq('work_date', today())
    .maybeSingle();
  if (!data) return { state: 'not_started', sessionId: null };
  const row = data as { id: string; status: string };
  return { state: row.status === 'closed' ? 'closed' : 'open', sessionId: row.id };
}

/**
 * Day-close guard (server source of truth): a van transaction (Sell / Collect /
 * Return / Issue) is allowed ONLY while today's work session is OPEN. No session
 * (not started) or a closed session (settled) ⇒ blocked — the rep must start a
 * new day first. Keeps the van reconciliation consistent (nothing is created
 * after settlement). Applied to every FMCG transaction path.
 */
export async function isVanDayOpen(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_work_sessions')
    .select('status, close_status')
    .eq('salesman_id', userId)
    .eq('work_date', today())
    .maybeSingle();
  if (!data) return false;
  const row = data as { status: string; close_status: string | null };
  // Closed OR submitted-for-close (close_status pending_approval) ⇒ the day is locked
  // for further sell/collect/return; the End Day approval/settlement chain must finish
  // (or a supervisor rejection re-opens it) before transactions resume.
  return row.status !== 'closed' && row.close_status !== 'pending_approval';
}

// ============================================================================
// Day Reopen (Phase 1) — governed request/approval reads. The transaction guard
// above blocks a closed day; this lets the salesman request a reason-based
// reopen and lets a Supervisor/Admin act on it. Flag-gated (platform.day_reopen,
// default OFF) and permission-gated. Reads only — the writes are RPCs.
// ============================================================================

export type ReopenStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'applied';

export interface DayReopenGate {
  /** Flag ON for the company. */
  enabled: boolean;
  /** Caller may submit a reopen request (and the day is closed). */
  canRequest: boolean;
  /** The caller's closed session id for today, if any. */
  sessionId: string | null;
  /** The current request for that session (latest), if any. */
  request: { id: string; reason: string; status: ReopenStatus; createdAt: string } | null;
}

/** Gate state for the Day-Closed screen: is reopen available, and is there a
 *  request in flight for the caller's (closed) day today? */
export async function loadDayReopenGate(ctx: UserContext): Promise<DayReopenGate> {
  const supabase = await createClient();
  const flags = await getFeatureFlags(supabase, ctx.companyId!);
  const enabled = dayReopenEnabled(flags);
  const off: DayReopenGate = { enabled: false, canRequest: false, sessionId: null, request: null };
  if (!enabled) return off;

  const { data: ws } = await supabase
    .from('erp_work_sessions')
    .select('id, status')
    .eq('salesman_id', ctx.userId)
    .eq('work_date', today())
    .maybeSingle();
  const session = ws as { id: string; status: string } | null;
  const closed = Boolean(session) && session!.status === 'closed';
  const sessionId = session?.id ?? null;

  let request: DayReopenGate['request'] = null;
  if (sessionId) {
    const { data: req } = await supabase
      .from('erp_day_reopen_requests')
      .select('id, reason, status, created_at')
      .eq('work_session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (req) {
      const r = req as { id: string; reason: string; status: ReopenStatus; created_at: string };
      request = { id: r.id, reason: r.reason, status: r.status, createdAt: r.created_at };
    }
  }

  const canRequest = enabled && closed && (hasPermission(ctx, 'day.reopen.request') || ctx.isSuperAdmin);
  return { enabled, canRequest, sessionId, request };
}

export interface PendingReopen {
  id: string;
  reason: string;
  note: string | null;
  reopenSeq: number;
  /** Times this day has already been reopened (the session counter). */
  reopenCount: number;
  /** Settlement lock at request time — Phase 1 is always 'none' (no settlement
   *  layer yet); Phase 2/3 surface the real settlement/cash/accountant state. */
  settlementStatus: string;
  createdAt: string;
  workDate: string;
  salesmanName: string;
}

/** Pending reopen requests in the caller's company (for the approver inbox).
 *  Returns [] when the flag is off or the caller lacks approve. */
export async function loadPendingDayReopens(ctx: UserContext): Promise<PendingReopen[]> {
  const supabase = await createClient();
  const flags = await getFeatureFlags(supabase, ctx.companyId!);
  if (!dayReopenEnabled(flags)) return [];
  if (!(hasPermission(ctx, 'day.reopen.approve') || ctx.isSuperAdmin)) return [];

  const { data } = await supabase
    .from('erp_day_reopen_requests')
    .select('id, reason, note, reopen_seq, lock_level, created_at, requested_by, work_session:erp_work_sessions(work_date, reopen_count)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  const rows = (data ?? []) as Array<{
    id: string; reason: string; note: string | null; reopen_seq: number; lock_level: string; created_at: string;
    requested_by: string; work_session: { work_date: string; reopen_count: number } | { work_date: string; reopen_count: number }[] | null;
  }>;
  if (rows.length === 0) return [];

  // Resolve salesman display names in one read.
  const ids = [...new Set(rows.map((r) => r.requested_by))];
  const { data: profs } = await supabase.from('erp_profiles').select('id, full_name').in('id', ids);
  const nameById = new Map((((profs ?? []) as { id: string; full_name: string | null }[])).map((p) => [p.id, p.full_name ?? '']));

  return rows.map((r) => {
    const ws = Array.isArray(r.work_session) ? r.work_session[0] : r.work_session;
    return {
      id: r.id,
      reason: r.reason,
      note: r.note,
      reopenSeq: r.reopen_seq,
      reopenCount: ws?.reopen_count ?? 0,
      settlementStatus: r.lock_level || 'none',
      createdAt: r.created_at,
      workDate: ws?.work_date ?? '',
      salesmanName: nameById.get(r.requested_by) || r.requested_by.slice(0, 8),
    };
  });
}
