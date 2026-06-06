// Health endpoint — the offline Tauri supervisor (src-tauri/main.rs) polls this
// before showing the window. Liveness on any build; offline also checks DB.
import { NextResponse } from 'next/server';
import { isOffline } from '@/lib/offline/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isOffline()) return NextResponse.json({ ok: true, mode: 'cloud' });
  try {
    const { connectLocal } = await import('@/lib/offline/db-client');
    const db = await connectLocal();
    try {
      await db.query('SELECT 1');
      return NextResponse.json({ ok: true, mode: 'offline', db: 'up' });
    } finally {
      await db.end().catch(() => {});
    }
  } catch (e) {
    return NextResponse.json({ ok: false, mode: 'offline', db: 'down', error: (e as Error).message }, { status: 503 });
  }
}
