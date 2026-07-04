import { NextResponse } from 'next/server';
import { bootstrap } from '@/lib/seed';
import { getState } from '@/lib/store';

export const dynamic = 'force-dynamic';

// GET /api/bootstrap — all seed collections plus persisted workflow state.
export async function GET() {
  const state = await getState();
  return NextResponse.json({ ...bootstrap(), state });
}
