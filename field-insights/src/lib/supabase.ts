import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, isSupabaseConfigured } from './env';
import type { Database } from './database.types';

// A single client for the Field Insights project ONLY. It reads VITE_FI_*
// variables and therefore never points at the VANTORA Supabase project.
// When env is not yet configured we expose `null` so the app can still boot
// (offline-first shell) without throwing.
export type FiClient = SupabaseClient<Database>;

export const supabase: FiClient | null = isSupabaseConfigured
  ? createClient<Database>(env.supabaseUrl, env.supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'fi-auth', // namespaced so it cannot clash with VANTORA
      },
    })
  : null;
