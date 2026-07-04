// Store factory — selects the persistence backend from the environment.
//   DATA_BACKEND=supabase (+ Supabase env) → SupabaseStore
//   otherwise                              → FileStore (default)
import { DataStore } from './adapter';
import { FileStore } from './file-store';

let instance: DataStore | null = null;

export function getStore(): DataStore {
  if (instance) return instance;
  const backend = process.env.DATA_BACKEND;
  if (backend === 'supabase' && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // lazy require so the file build never depends on Supabase env being present
    const { SupabaseStore } = require('./supabase-store') as typeof import('./supabase-store');
    instance = new SupabaseStore();
  } else {
    instance = new FileStore();
  }
  return instance;
}

export type { DataStore, ServerState } from './adapter';
