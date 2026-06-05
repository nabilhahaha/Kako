// Offline GoTrue: GET /auth/v1/user — supabase-js validates the session here.
import { NextRequest, NextResponse } from 'next/server';
import { offlineRoutesEnabled, verifyBearer } from '@/lib/offline/gateway';
import { connectLocal } from '@/lib/offline/db-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!offlineRoutesEnabled()) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const claims = verifyBearer(req.headers.get('authorization'));
  if (!claims) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const db = await connectLocal();
  try {
    const { rows } = await db.query('SELECT lu.id, lu.email, lu.company_id, p.full_name FROM erp_local_users lu LEFT JOIN erp_profiles p ON p.id = lu.id WHERE lu.id = $1', [claims.sub]);
    if (rows.length === 0) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const u = rows[0] as { id: string; email: string; company_id: string | null; full_name: string | null };
    return NextResponse.json({
      id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email,
      app_metadata: { provider: 'offline', company_id: u.company_id },
      user_metadata: { full_name: u.full_name },
      created_at: new Date(0).toISOString(),
    });
  } finally {
    await db.end().catch(() => {});
  }
}
