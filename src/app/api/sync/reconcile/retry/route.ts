// POST /api/sync/reconcile/retry — operator on-demand retry (admin, tenant-scoped).
// Body: { entity, pk } for one record, or { all: true } for every record needing
// attention. Resets the backoff/attempt counter then re-runs the handler now
// (orders impersonate the originating cashier). Behind KAKO_SYNC (404 when off).
import { NextRequest, NextResponse } from 'next/server';
import { isSyncEnabledServer } from '@/lib/sync/flag';
import { getUserContext } from '@/lib/erp/auth-context';
import { createServiceClient } from '@/lib/supabase/service';
import { reconcileOne } from '@/lib/sync/server/reconcile';
import {
  makeReconcileDeps, makeReconcileHandlers, RECONCILABLE_ENTITIES,
  fetchReconcileOverview, loadMirrorRecord, resetForRetry,
} from '@/lib/sync/server/reconcile-deps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isSyncEnabledServer()) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const ctx = await getUserContext();
  if (!ctx || !ctx.companyId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (ctx.topRole !== 'admin' && !ctx.isSuperAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const companyId = ctx.companyId;

  let db;
  try { db = createServiceClient(); } catch { return NextResponse.json({ error: 'unconfigured' }, { status: 503 }); }

  const body = (await req.json().catch(() => ({}))) as { entity?: string; pk?: string; all?: boolean };
  let targets: { entity: string; pk: string }[];
  if (body.all) {
    const overview = await fetchReconcileOverview(db, companyId);
    targets = overview.attention.filter((r) => r.status === 'failed').map((r) => ({ entity: r.entity, pk: r.pk }));
  } else if (body.entity && body.pk) {
    targets = [{ entity: body.entity, pk: body.pk }];
  } else {
    return NextResponse.json({ error: 'entity+pk or all required' }, { status: 400 });
  }

  const deps = makeReconcileDeps(db, RECONCILABLE_ENTITIES);
  const handlers = makeReconcileHandlers(db);
  const results = [];
  for (const tgt of targets) {
    const rec = await loadMirrorRecord(db, companyId, tgt.entity, tgt.pk);
    if (!rec) { results.push({ ...tgt, status: 'missing' }); continue; }
    await resetForRetry(db, companyId, tgt.entity, tgt.pk);
    try {
      results.push(await reconcileOne(deps, handlers, rec));
    } catch (e) {
      results.push({ ...tgt, status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ results }, { headers: { 'Cache-Control': 'no-store' } });
}
