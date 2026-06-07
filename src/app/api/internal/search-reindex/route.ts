// POST /api/internal/search-reindex — Search OS backfill/reconcile (V1).
// Cron-auth (CRON_SECRET) + service role; (re)projects source rows into the
// unified index via the provider registry. No-op when KAKO_SEARCH is OFF.
// P2 adds event-driven incremental indexing; V1 is full backfill + reconcile.
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { reindexAll } from '@/lib/search/backfill';
import { SEARCH_ENABLED } from '@/lib/search/flags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!SEARCH_ENABLED()) return NextResponse.json({ ok: true, skipped: 'flag-off' });

  let db;
  try { db = createServiceClient(); } catch {
    return NextResponse.json({ error: 'unconfigured' }, { status: 503 });
  }
  const counts = await reindexAll(db);
  return NextResponse.json({ ok: true, counts }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = POST;
