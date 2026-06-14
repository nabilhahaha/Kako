import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { UserContext } from '@/lib/erp/auth-context';
import { today } from '@/lib/erp/work-session';
import type { VanDayState } from './day';

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
    .select('status')
    .eq('salesman_id', userId)
    .eq('work_date', today())
    .maybeSingle();
  return Boolean(data) && (data as { status: string }).status !== 'closed';
}
