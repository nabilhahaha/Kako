import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/auth';

// POST /api/auth/register — delegates to the configured AuthProvider.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const result = await getAuth().register({
    name: String(b.name || ''), phone: String(b.phone || ''), company: String(b.company || ''),
    job: String(b.job || ''), country: String(b.country || ''), city: String(b.city || ''),
    email: b.email, password: String(b.password || ''),
  });
  return NextResponse.json(result);
}
