import { NextRequest, NextResponse } from 'next/server';
import { setRequest } from '@/lib/store';

// POST /api/requests/:id  { action: 'approve' | 'reject', reason?: string }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const status = body.action === 'approve' ? 'approved' : 'rejected';
  const state = await setRequest(id, status);
  return NextResponse.json({ requests: state.requests });
}
