import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseUrl, getSupabaseAnonKey } from './config';
import { rateLimit, clientIp } from '@/lib/erp/rate-limit';

const PUBLIC_PATHS = ['/login', '/register', '/auth', '/forgot-password', '/reset-password'];

// Auth endpoints that accept credential POSTs (login / register / password flows).
// IP-throttled to blunt credential-stuffing / brute-force bursts. Best-effort,
// in-memory per edge isolate — see rate-limit.ts; a global guarantee needs shared
// infra (Upstash/Redis).
const AUTH_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'];
const AUTH_LIMIT = 10;
const AUTH_WINDOW_MS = 60_000;

export async function updateSession(request: NextRequest) {
  // Throttle credential POSTs by client IP before touching Supabase.
  if (
    request.method === 'POST' &&
    AUTH_PATHS.some((p) => request.nextUrl.pathname.startsWith(p))
  ) {
    const rl = rateLimit(`auth:${clientIp(request.headers)}`, AUTH_LIMIT, AUTH_WINDOW_MS);
    if (!rl.ok)
      return new NextResponse('Too many requests. Please wait and try again.', {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfter) },
      });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run code between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // Not logged in and trying to access a protected page → redirect to login
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Logged in and visiting the login page → redirect to dashboard
  if (user && pathname.startsWith('/login')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
