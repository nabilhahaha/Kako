import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, isSupabaseConfigured } from './env';

// A single client for the Field Insights project ONLY. It reads VITE_FI_*
// variables and therefore never points at the VANTORA Supabase project.
// When env is not yet configured we expose `null` so the app can still boot
// (offline-first shell) without throwing.
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(env.supabaseUrl, env.supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'fi-auth', // namespaced so it cannot clash with VANTORA
      },
    })
  : null;
