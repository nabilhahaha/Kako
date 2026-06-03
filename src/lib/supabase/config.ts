// Supabase connection config.
//
// Values come EXCLUSIVELY from environment variables — there are no hardcoded
// fallbacks. Missing config fails CLOSED: the getters below throw with a clear,
// var-named error. To keep `next build` / prerender from crashing at import
// time, the getters are invoked INSIDE the client-creation functions (runtime),
// never at module top-level.
//
// NOTE: the publishable/anon key is designed to be exposed to browsers; it is
// shipped in the client bundle of every Supabase app. Data is protected by
// Row Level Security, not by hiding this key. The secret service-role key is
// read separately in service.ts (server-only, never NEXT_PUBLIC_*).

/** Public project URL (browser + server, anon). Throws if unset. */
export function getSupabaseUrl(): string {
  // Referenced as a static member so Next.js can inline the NEXT_PUBLIC_* value
  // into the client bundle at build time.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url)
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set — configure it in the deploy environment.');
  return url;
}

/** Public anon/publishable key (browser + server). Throws if unset. */
export function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key)
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set — configure it in the deploy environment.');
  return key;
}
