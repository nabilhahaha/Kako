// GET/POST /api/internal/workflow-tick — workflow runtime tick (Constitution Art. 32).
// Resumes due generalized runs (delay/retry: runtime_state='waiting' with a past
// next_action_at) by advancing them through the pure runtime, and runs the engine's
// approval SLA/escalation tick (erp_workflow_tick) — one engine, reused. Cron-auth
// (CRON_SECRET) + service role. No-op until a workflow with automated steps exists.
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { advanceInstance, listDueRuns } from '@/lib/workflow/runtime-service';

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

  // 2) Generalized runtime: advance due (delay/retry) runs.
  const due = await listDueRuns(db, BATCH);
  const results: { id: string; state?: string; error?: string }[] = [];
  for (const r of due) {
    try {
      const outcome = await advanceInstance(db, r.id);   // service-role; see runtime ADR for impersonation follow-up
      results.push({ id: r.id, state: outcome?.state });
    } catch (e) {
      results.push({ id: r.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const summary = results.reduce((a, r) => { const k = r.error ? 'error' : (r.state ?? 'unknown'); a[k] = (a[k] ?? 0) + 1; return a; }, {} as Record<string, number>);
  return NextResponse.json({ ok: true, engineTick, processed: results.length, summary }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = POST;
