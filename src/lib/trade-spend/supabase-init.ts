import { supabase } from '@/lib/supabase';

/**
 * Check whether the Supabase trade-spend tables exist and are accessible.
 * Returns `true` if they're ready, `false` otherwise.
 *
 * We intentionally do NOT attempt DDL via the anon key — if the tables
 * haven't been migrated the app gracefully falls back to localStorage.
 */
export async function initSupabaseTables(): Promise<boolean> {
  try {
    // Test if tables exist by querying distributors
    const { error } = await supabase.from('ts_distributors').select('id').limit(1);

    if (!error) return true; // Tables exist

    // Tables don't exist — try to create them
    // Note: This requires appropriate permissions
    console.warn('[Supabase] Tables not found, attempting auto-migration...');

    // We can't run DDL via the anon key, so just return false
    // The app will use localStorage instead
    console.warn('[Supabase] Auto-migration not possible with anon key. Using localStorage.');
    return false;
  } catch {
    console.warn('[Supabase] Connection failed. Using localStorage.');
    return false;
  }
}
