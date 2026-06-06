// GET /api/sync/pull?entity=&cursor= — cursor-based cloud change feed.
// Behind KAKO_SYNC (404 when off). See docs/architecture/offline-first-sync.md.
import { NextRequest, NextResponse } from 'next/server';
import { isSyncEnabledServer } from '@/lib/sync/flag';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { pullChanges } from '@/lib/sync/server/pull';
import { makePullDeps } from '@/lib/sync/server/supabase-deps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isSyncEnabledServer()) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const ctx = await getUserContext();
  if (!ctx || !ctx.companyId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const entity = req.nextUrl.searchParams.get('entity');
  if (!entity) return NextResponse.json({ error: 'entity required' }, { status: 400 });
  const cursor = req.nextUrl.searchParams.get('cursor');

  const supabase = await createClient();
  const result = await pullChanges(entity, cursor, makePullDeps(supabase, ctx.companyId));
  return NextResponse.json(result);
}
