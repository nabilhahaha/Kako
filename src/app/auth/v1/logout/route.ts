// Offline GoTrue: POST /auth/v1/logout — stateless offline, just acknowledge.
import { NextResponse } from 'next/server';
import { offlineRoutesEnabled } from '@/lib/offline/gateway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  if (!offlineRoutesEnabled()) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
