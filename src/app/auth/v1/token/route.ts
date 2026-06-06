// Offline GoTrue: POST /auth/v1/token?grant_type=password|refresh_token
// Replaces Supabase Auth's token endpoint for the offline build. 404 on cloud.
import { NextRequest, NextResponse } from 'next/server';
import { offlineRoutesEnabled, gotrueSession } from '@/lib/offline/gateway';
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
    // The refresh_token is the prior signed JWT. It is EXPECTED to be expired
    // (it is the previous 12h access token), so we verify the SIGNATURE ONLY
    // (ignoreExpiry) — an expired-but-authentic token still proves identity, and
    // we re-issue a fresh one. Verifying expiry here would make refresh
    // impossible exactly when it is needed (after the access token lapses),
    // silently logging the user out across restarts / idle > 12h.
    const { verifyToken } = await import('@/lib/offline/jwt');
    const { jwtSecret } = await import('@/lib/offline/secrets');
    const verified = verifyToken(jwtSecret(), String(body.refresh_token ?? ''), undefined, { ignoreExpiry: true });
    if (!verified.ok) return NextResponse.json({ error: 'invalid_grant' }, { status: 400 });
    const claims = verified.claims;
    const db = await connectLocal();
    try {
      const { rows } = await db.query('SELECT email, password_hash FROM erp_local_users WHERE id = $1 AND is_active', [claims.sub]);
      if (rows.length === 0) return NextResponse.json({ error: 'invalid_grant' }, { status: 400 });
      // Re-mint by issuing a session shaped from the existing claims (no password
      // re-check on refresh; identity already proven by the signed token).
      const { mintToken } = await import('@/lib/offline/jwt');
      const token = mintToken(jwtSecret(), { sub: claims.sub, company_id: claims.company_id, email: claims.email });
      const session = { token, user: { id: claims.sub, email: claims.email ?? '', companyId: claims.company_id ?? null, fullName: null } };
      return NextResponse.json(gotrueSession(session));
    } finally {
      await db.end().catch(() => {});
    }
  }

  return NextResponse.json({ error: 'unsupported_grant_type' }, { status: 400 });
}
