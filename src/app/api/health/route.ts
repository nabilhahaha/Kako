import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

// Health check — GET /api/health. Liveness + database connectivity for uptime
// monitors (returns 200 when healthy, 503 when the database is unreachable).
// Public + read-only: returns no tenant data, just a status + latency. Additive;
// no behavior change to any existing route.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();
  let db: 'ok' | 'error' = 'ok';
  try {
    const client = createServiceClient();
    const { error } = await client.from('erp_companies').select('id', { head: true, count: 'exact' }).limit(1);
    if (error) db = 'error';
  } catch {
    db = 'error';
  }
  const ok = db === 'ok';
  return NextResponse.json(
    { ok, db, ts: new Date().toISOString(), latencyMs: Date.now() - startedAt },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
