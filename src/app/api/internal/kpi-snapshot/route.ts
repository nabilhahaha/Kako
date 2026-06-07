import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createSupabaseCoverageGateway } from '@/lib/distribution/coverage/supabase-gateway';
import { createSupabaseSnapshotGateway } from '@/lib/distribution/coverage/supabase-snapshot-gateway';
import { snapshotReps, type RepScope } from '@/lib/distribution/coverage/snapshot';
import { DISTRIBUTION_ENABLED } from '@/lib/distribution/flags';

/** ── Rep-day KPI snapshot scheduler — POST/GET /api/internal/kpi-snapshot ───
 *  Triggered by Vercel Cron (Authorization: Bearer $CRON_SECRET). Computes the
 *  previous day's coverage KPIs for every rep who had visits that day and upserts
 *  them into erp_rep_day_kpis (service-role; multi-tenant — each row carries its
 *  company/branch). INERT unless KAKO_DISTRIBUTION is on (returns skipped). The
 *  snapshot itself is idempotent (upsert per salesman+date), so re-runs are safe. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Db = Parameters<typeof createSupabaseCoverageGateway>[0];

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // Inert by default — no work, no data, until the distribution flag is enabled.
  if (!DISTRIBUTION_ENABLED()) {
    return NextResponse.json({ ok: true, skipped: 'disabled' }, { headers: { 'Cache-Control': 'no-store' } });
  }

  let db: ReturnType<typeof createServiceClient>;
  try { db = createServiceClient(); } catch {
    return NextResponse.json({ error: 'unconfigured' }, { status: 503 });
  }

  // Target the previous day (end-of-day snapshot), UTC.
  const url = new URL(req.url);
  const date = (url.searchParams.get('date') ?? '').trim() || new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  // Reps with visit activity on the date → their branch + company (one row per rep).
  const { data: visitRows, error } = await db
    .from('erp_visits')
    .select('salesman_id, branch_id, branch:erp_branches(company_id)')
    .eq('visit_date', date)
    .not('salesman_id', 'is', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const seen = new Set<string>();
  const reps: RepScope[] = [];
  for (const r of (visitRows ?? []) as Array<{ salesman_id: string; branch_id: string; branch: { company_id: string } | { company_id: string }[] | null }>) {
    if (!r.salesman_id || seen.has(r.salesman_id)) continue;
    const branch = Array.isArray(r.branch) ? r.branch[0] : r.branch;
    const companyId = branch?.company_id;
    if (!companyId || !r.branch_id) continue;
    seen.add(r.salesman_id);
    reps.push({ companyId, branchId: r.branch_id, salesmanId: r.salesman_id });
  }

  const coverageGw = createSupabaseCoverageGateway(db as unknown as Db);
  const snapshotGw = createSupabaseSnapshotGateway(db as unknown as Db);
  const result = await snapshotReps(coverageGw, snapshotGw, reps, date);

  return NextResponse.json(
    { ok: true, date, reps: reps.length, snapshotted: result.snapshotted },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

// Vercel Cron issues GET by default; accept both.
export const GET = POST;
