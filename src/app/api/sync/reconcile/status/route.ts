// GET /api/sync/reconcile/status — reconciliation overview for the operator
// console (admin, tenant-scoped). Behind KAKO_SYNC (404 when off).
import { NextResponse } from 'next/server';
import { isSyncEnabledServer } from '@/lib/sync/flag';
import { getUserContext } from '@/lib/erp/auth-context';
import { createServiceClient } from '@/lib/supabase/service';
import { fetchReconcileOverview } from '@/lib/sync/server/reconcile-deps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isSyncEnabledServer()) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const ctx = await getUserContext();
  if (!ctx || !ctx.companyId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (ctx.topRole !== 'admin' && !ctx.isSuperAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  let db;
  try { db = createServiceClient(); } catch { return NextResponse.json({ error: 'unconfigured' }, { status: 503 }); }
  const overview = await fetchReconcileOverview(db, ctx.companyId);
  return NextResponse.json(overview, { headers: { 'Cache-Control': 'no-store' } });
}
