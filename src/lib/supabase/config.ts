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
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://nrvydmkxjnctdlaxdhur.supabase.co';

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_DtpmoBXjf4sQWpXSJddJ-A_eM3q7kHo';
