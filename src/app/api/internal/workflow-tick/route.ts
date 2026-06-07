// GET/POST /api/internal/workflow-tick — workflow runtime tick (Constitution Art. 32).
// Resumes due generalized runs (delay/retry: runtime_state='waiting' with a past
// next_action_at) by advancing them through the pure runtime, and runs the engine's
// approval SLA/escalation tick (erp_workflow_tick) — one engine, reused. Cron-auth
// (CRON_SECRET) + service role. No-op until a workflow with automated steps exists.
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { advanceInstance, claimDueRuns, listDueRuns, loadRun, releaseRun } from '@/lib/workflow/runtime-service';
import { createImpersonatedClient } from '@/lib/sync/server/impersonate';
import { WF_CLAIM_DUE_RUNS, WF_CLAIM_LEASE_SECONDS, WF_DISPATCH_SWEEP } from '@/lib/workflow/flags';
import { listPendingEvents, markEventDispatched, recordDispatchFailure } from '@/lib/workflow/events';
import { dispatchEvent, makeDispatchDeps } from '@/lib/workflow/dispatcher';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BATCH = 100;

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let db;
  try { db = createServiceClient(); } catch {
    return NextResponse.json({ error: 'unconfigured' }, { status: 503 });
  }

  // 1) Existing engine: approval-task SLA + escalation (reuse, never duplicated).
  let engineTick: string | null = null;
  try { const { error } = await db.rpc('erp_workflow_tick'); if (error) engineTick = error.message; }
  catch (e) { engineTick = e instanceof Error ? e.message : String(e); }

  // 2) Generalized runtime: advance due (delay/retry) runs AS the originating
  //    user (impersonation → RLS applies, tenant isolation preserved). Runs with
  //    no actor are skipped (cannot impersonate safely) for an operator to handle.
  //    C2 (flagged): claim runs single-flight (FOR UPDATE SKIP LOCKED + lease) so
  //    overlapping ticks never double-process; release after each run.
  const claiming = WF_CLAIM_DUE_RUNS();
  const due = claiming
    ? await claimDueRuns(db, BATCH, WF_CLAIM_LEASE_SECONDS(), 'workflow-tick')
    : await listDueRuns(db, BATCH);
  const results: { id: string; state?: string; error?: string; skipped?: string }[] = [];
  for (const r of due) {
    try {
      if (!r.startedBy) { results.push({ id: r.id, skipped: 'no-actor' }); continue; }
      const loaded = await loadRun(db, r.id);
      if (!loaded) { results.push({ id: r.id, skipped: 'missing' }); continue; }
      const userDb = await createImpersonatedClient(db, {
        userId: r.startedBy, companyId: loaded.run.companyId, entity: 'workflow_run', pk: r.id,
        purpose: 'workflow-runtime',
      });
      const outcome = await advanceInstance(userDb, r.id);
      results.push({ id: r.id, state: outcome?.state });
    } catch (e) {
      results.push({ id: r.id, error: e instanceof Error ? e.message : String(e) });
    } finally {
      if (claiming) { try { await releaseRun(db, r.id); } catch { /* lease expiry is the fallback */ } }
    }
  }

  // 3) C1 (flagged): at-least-once dispatch sweep — drain undispatched events,
  //    impersonating the originating actor (RLS preserved). Actor-less events are
  //    left for an operator (same policy as runs). Reuses the existing dispatcher.
  let swept = 0, sweptOk = 0, sweptSkipped = 0;
  if (WF_DISPATCH_SWEEP()) {
    const pending = await listPendingEvents(db, BATCH);
    for (const ev of pending) {
      swept++;
      try {
        if (!ev.actorId) { sweptSkipped++; continue; }
        const userDb = await createImpersonatedClient(db, {
          userId: ev.actorId, companyId: ev.companyId, entity: 'workflow_event', pk: ev.id,
          purpose: 'workflow-dispatch',
        });
        await dispatchEvent(makeDispatchDeps(userDb), ev);
        await markEventDispatched(db, ev.id);
        sweptOk++;
      } catch (e) {
        await recordDispatchFailure(db, ev.id, ev.dispatchAttempts, e instanceof Error ? e.message : String(e)).catch(() => {});
      }
    }
  }

  const summary = results.reduce((a, r) => { const k = r.error ? 'error' : (r.state ?? 'unknown'); a[k] = (a[k] ?? 0) + 1; return a; }, {} as Record<string, number>);
  return NextResponse.json({ ok: true, engineTick, processed: results.length, summary, dispatchSweep: { swept, ok: sweptOk, skipped: sweptSkipped } }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = POST;
