import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseUrl, getSupabaseAnonKey } from './config';

export function createClient() {
  // Resolve env at call time so missing config fails closed here (not at import).
  return createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey());
}
