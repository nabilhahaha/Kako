// POST/GET /api/sync/reconcile — materialize offline-created mirror records into
// the real business tables (design §19). Cron-triggered (Authorization: Bearer
// $CRON_SECRET), service-role. Behind KAKO_SYNC (404 when off); inert in
// production until the 0001 + 0002 sync migrations are reviewed + applied.
import { NextRequest, NextResponse } from 'next/server';
import { isSyncEnabledServer } from '@/lib/sync/flag';
import { createServiceClient } from '@/lib/supabase/service';
import { reconcile } from '@/lib/sync/server/reconcile';
import { makeReconcileDeps, makeReconcileHandlers, RECONCILABLE_ENTITIES } from '@/lib/sync/server/reconcile-deps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BATCH = 200;

export async function POST(req: NextRequest) {
  if (!isSyncEnabledServer()) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let db;
  try { db = createServiceClient(); } catch {
    return NextResponse.json({ error: 'unconfigured' }, { status: 503 });
  }

  const deps = makeReconcileDeps(db, RECONCILABLE_ENTITIES);
  const handlers = makeReconcileHandlers(db);
  const outcomes = await reconcile(deps, handlers, { limit: BATCH });

  const summary = outcomes.reduce(
    (a, o) => { a[o.status] = (a[o.status] ?? 0) + 1; return a; },
    {} as Record<string, number>,
  );
  return NextResponse.json({ ok: true, processed: outcomes.length, summary }, { headers: { 'Cache-Control': 'no-store' } });
}

// Vercel Cron issues GET by default; accept both.
export const GET = POST;
