import { NextRequest, NextResponse } from 'next/server';
import { setReview } from '@/lib/store';

// POST /api/reviews/:id  { action: 'approve' | 'reject' }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const status = body.action === 'approve' ? 'approved' : 'rejected';
  const state = await setReview(id, status);
  return NextResponse.json({ reviews: state.reviews });
}
