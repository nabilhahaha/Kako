// Offline GoTrue: POST /auth/v1/token?grant_type=password|refresh_token
// Replaces Supabase Auth's token endpoint for the offline build. 404 on cloud.
import { NextRequest, NextResponse } from 'next/server';
import { offlineRoutesEnabled, gotrueSession, verifyBearer } from '@/lib/offline/gateway';
import { offlineLogin } from '@/lib/offline/auth';
import { connectLocal } from '@/lib/offline/db-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!offlineRoutesEnabled()) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const grant = req.nextUrl.searchParams.get('grant_type') ?? 'password';
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  if (grant === 'password') {
    const email = String(body.email ?? '');
    const password = String(body.password ?? '');
    const db = await connectLocal();
    try {
      const session = await offlineLogin(db, email, password);
      if (!session) return NextResponse.json({ error: 'invalid_grant', error_description: 'Invalid login credentials' }, { status: 400 });
      return NextResponse.json(gotrueSession(session));
    } finally {
      await db.end().catch(() => {});
    }
  }

  if (grant === 'refresh_token') {
    // The refresh_token is the prior signed JWT; verify + re-issue a fresh one
    // for the same identity (offline has no rotating refresh store).
    const claims = verifyBearer(`Bearer ${String(body.refresh_token ?? '')}`);
    if (!claims) return NextResponse.json({ error: 'invalid_grant' }, { status: 400 });
    const db = await connectLocal();
    try {
      const { rows } = await db.query('SELECT email, password_hash FROM erp_local_users WHERE id = $1 AND is_active', [claims.sub]);
      if (rows.length === 0) return NextResponse.json({ error: 'invalid_grant' }, { status: 400 });
      // Re-mint by issuing a session shaped from the existing claims (no password
      // re-check on refresh; identity already proven by the signed token).
      const { mintToken } = await import('@/lib/offline/jwt');
      const { jwtSecret } = await import('@/lib/offline/secrets');
      const token = mintToken(jwtSecret(), { sub: claims.sub, company_id: claims.company_id, email: claims.email });
      const session = { token, user: { id: claims.sub, email: claims.email ?? '', companyId: claims.company_id ?? null, fullName: null } };
      return NextResponse.json(gotrueSession(session));
    } finally {
      await db.end().catch(() => {});
    }
  }

  return NextResponse.json({ error: 'unsupported_grant_type' }, { status: 400 });
}
