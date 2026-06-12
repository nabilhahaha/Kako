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
// Single source of truth: vantora-staging (rsjvgehvastmawzwnqcs). The default
// below points the app at vantora-staging out of the box; a host may still
// override via NEXT_PUBLIC_* env vars. (Previous default routed to the legacy
// kako-fmcg project — that is now the archived source, not the live one.)
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://rsjvgehvastmawzwnqcs.supabase.co';

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_2XSH_Cjd9h3NN2jMmwGgBQ_1AGAsUEE';
