// GET/POST /api/internal/alerts-tick — Critical Alerts evaluator. For each company
// it evaluates every active alert rule's source against existing data, raises /
// refreshes / auto-resolves alert instances, and dispatches notifications. Cron-auth
// (CRON_SECRET) + service role. No-op while KAKO_ALERTS is OFF (engine inert).
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { ALERTS_ENABLED } from '@/lib/alerts';
import { runCompanyAlerts } from '@/lib/alerts/evaluator-server';
import '@/lib/alerts/adapters';  // register built-in channel adapters (email stub)
import '@/lib/alerts/sources';   // register built-in alert sources

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!ALERTS_ENABLED()) {
    return NextResponse.json({ ok: true, disabled: true }, { headers: { 'Cache-Control': 'no-store' } });
  }

  let db;
  try { db = createServiceClient(); } catch {
    return NextResponse.json({ error: 'unconfigured' }, { status: 503 });
  }

  const { data: companies } = await db.from('erp_companies').select('id').limit(1000);
  const totals = { raised: 0, refreshed: 0, resolved: 0, companies: 0 };
  for (const row of (companies ?? []) as { id: string }[]) {
    try {
      const r = await runCompanyAlerts(db, row.id);
      totals.raised += r.raised; totals.refreshed += r.refreshed; totals.resolved += r.resolved; totals.companies++;
    } catch { /* one company's failure never stops the sweep */ }
  }
  return NextResponse.json({ ok: true, ...totals }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = POST;
