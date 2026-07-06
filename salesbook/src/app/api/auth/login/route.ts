import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/auth';

// POST /api/auth/login — delegates to the configured AuthProvider.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const result = await getAuth().signIn({ phone: String(body.phone || ''), password: body.password, otp: body.otp });
  return NextResponse.json(result, { status: result.ok ? 200 : 401 });
}
