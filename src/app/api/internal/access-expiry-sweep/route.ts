// GET/POST /api/internal/access-expiry-sweep — temporary-access expiry sweep
// (Step 2 hardening). Stamps `expired_at` on lapsed grants (effective_to < now())
// via the guarded SECURITY DEFINER function and records one aggregate audit entry.
// NON-DESTRUCTIVE (stamps, never deletes), so it is safe to run unconditionally.
// Cron-auth (CRON_SECRET) + service role.
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { log, alert } from '@/lib/observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let db;
  try { db = createServiceClient(); } catch {
    return NextResponse.json({ error: 'unconfigured' }, { status: 503 });
  }

  const { data, error } = await db.rpc('erp_sweep_expired_access');
  if (error) {
    await alert('access_expiry_sweep.failed', 'critical', { route: 'access-expiry-sweep', error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  log.info('access_expiry_sweep.swept', { expired: data ?? 0 });
  return NextResponse.json({ ok: true, expired: data ?? 0 });
}

export async function POST(req: NextRequest) { return handle(req); }
export async function GET(req: NextRequest) { return handle(req); }
