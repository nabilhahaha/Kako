// POST /api/sync/push — idempotent batch apply of client outbox ops.
// Behind KAKO_SYNC (404 when off); inert in production until the sync mirror
// migration is reviewed + applied. See docs/architecture/offline-first-sync.md.
import { NextRequest, NextResponse } from 'next/server';
import { isSyncEnabledServer } from '@/lib/sync/flag';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { applyPush, type PushedOp } from '@/lib/sync/server/apply';
import { makeApplyDeps } from '@/lib/sync/server/supabase-deps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isSyncEnabledServer()) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const ctx = await getUserContext();
  if (!ctx || !ctx.companyId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { ops?: PushedOp[] };
  const ops = Array.isArray(body.ops) ? body.ops : [];
  if (ops.length === 0) return NextResponse.json({ outcomes: [] });

  const supabase = await createClient();
  const deps = makeApplyDeps(supabase, ctx.companyId);
  const outcomes = await applyPush(ops, deps);
  return NextResponse.json({ outcomes });
}
