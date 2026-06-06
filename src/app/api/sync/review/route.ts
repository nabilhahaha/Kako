// GET  /api/sync/review        — open inventory-count conflicts for the company
// POST /api/sync/review {id, choice} — resolve one (keep-local | keep-cloud)
// Behind KAKO_SYNC (404 when off); admin-only.
import { NextRequest, NextResponse } from 'next/server';
import { isSyncEnabledServer } from '@/lib/sync/flag';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { resolveReviewRow, type ReviewChoice } from '@/lib/sync/server/review';
import { makeApplyDeps, fetchOpenReviews, fetchReview, markReviewResolved } from '@/lib/sync/server/supabase-deps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function admin() {
  const ctx = await getUserContext();
  if (!ctx || !ctx.companyId) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  if (ctx.topRole !== 'admin' && !ctx.isSuperAdmin) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  return { ctx };
}

export async function GET() {
  if (!isSyncEnabledServer()) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const a = await admin();
  if (a.error) return a.error;
  const supabase = await createClient();
  const reviews = await fetchOpenReviews(supabase, a.ctx.companyId!);
  return NextResponse.json({ reviews });
}

export async function POST(req: NextRequest) {
  if (!isSyncEnabledServer()) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const a = await admin();
  if (a.error) return a.error;
  const body = (await req.json().catch(() => ({}))) as { id?: number; choice?: ReviewChoice };
  if (typeof body.id !== 'number' || (body.choice !== 'keep-local' && body.choice !== 'keep-cloud')) {
    return NextResponse.json({ error: 'id and choice (keep-local|keep-cloud) required' }, { status: 400 });
  }

  const supabase = await createClient();
  const companyId = a.ctx.companyId!;
  const item = await fetchReview(supabase, companyId, body.id);
  if (!item) return NextResponse.json({ error: 'review not found' }, { status: 404 });

  const resolution = resolveReviewRow(body.choice, item, Date.now());
  if (resolution.action === 'commit') {
    const deps = makeApplyDeps(supabase, companyId);
    await deps.commit(resolution.row, {
      clientOpId: resolution.ingestClientOpId, entity: item.entity, pk: item.pk, appliedAt: Date.now(),
    });
  }
  await markReviewResolved(supabase, companyId, body.id, body.choice);
  return NextResponse.json({ ok: true, action: resolution.action });
}
