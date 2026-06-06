// Supabase connection config.
//
// Reads from NEXT_PUBLIC_* env vars when present (recommended — set these in
// your host's environment to point at a different project). Falls back to the
// project's public values so the app works out of the box on a fresh deploy.
//
// NOTE: the publishable/anon key is designed to be exposed to browsers; it is
// shipped in the client bundle of every Supabase app. Data is protected by
// Row Level Security, not by hiding this key. The secret service-role key is
// NOT here (it lives only in the Edge Function's managed environment).
// OFFLINE GUARD (AU-5): in the offline desktop edition the app must NEVER reach
// the cloud project. If the offline build is misconfigured (NEXT_PUBLIC_* not
// injected at build time) we fall back to the LOCAL app origin, not the cloud
// literal — so a paying offline customer's auth can never leak to the cloud.
const OFFLINE_BUILD = process.env.KAKO_OFFLINE === '1' || process.env.KAKO_OFFLINE === 'true';
const LOCAL_ORIGIN = 'http://127.0.0.1:54331';

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  (OFFLINE_BUILD ? LOCAL_ORIGIN : 'https://nrvydmkxjnctdlaxdhur.supabase.co');

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  (OFFLINE_BUILD ? '' : 'sb_publishable_DtpmoBXjf4sQWpXSJddJ-A_eM3q7kHo');

// Cookie options for the @supabase/ssr clients. The offline desktop edition is
// served over PLAIN HTTP (http://127.0.0.1:54331) inside WKWebView; a `Secure`
// cookie is silently dropped on http, which would mean the browser sets the auth
// session but the server never receives it → getUser() is null → login never
// reaches the dashboard. So for an http origin we force secure:false. For the
// cloud (https) build we leave the library defaults (secure cookies).
const IS_HTTP_LOCAL = SUPABASE_URL.startsWith('http://');
export const SUPABASE_COOKIE_OPTIONS = IS_HTTP_LOCAL
  ? { secure: false as const, sameSite: 'lax' as const, path: '/' }
  : undefined;
