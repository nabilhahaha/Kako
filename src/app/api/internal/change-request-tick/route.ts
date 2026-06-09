// GET/POST /api/internal/change-request-tick — Change Request engine due-sweep.
// Applies every ready change request (immediate approvals + scheduled requests
// whose effective date has arrived) via erp_change_request_run_due, which gates
// each one through erp_change_request_apply. Cron-auth (CRON_SECRET) + service
// role. No-op while KAKO_CHANGE_REQUESTS is OFF (the engine is inert).
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { CHANGE_REQUESTS_ENABLED } from '@/lib/change-requests';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Engine inert until enabled — succeed as a no-op so the cron stays green.
  if (!CHANGE_REQUESTS_ENABLED()) {
    return NextResponse.json({ ok: true, disabled: true, applied: 0 }, { headers: { 'Cache-Control': 'no-store' } });
  }

  let db;
  try { db = createServiceClient(); } catch {
    return NextResponse.json({ error: 'unconfigured' }, { status: 503 });
  }

  const { data, error } = await db.rpc('erp_change_request_run_due');
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, applied: (data as number) ?? 0 }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = POST;
