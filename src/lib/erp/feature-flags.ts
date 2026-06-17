import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { FEATURES, defaultEnabled } from './feature-catalog';

/**
 * Resolve a tenant's effective feature flags: a stored override row wins, else
 * the code default (Lite preset). Returns a complete map (every catalog feature
 * present) so callers can gate NAV / UI / validation / business logic without
 * undefined checks. Server-only (reads under the caller's RLS).
 */

export type FeatureFlags = Record<string, boolean>;

interface FlagRow { feature_key: string; enabled: boolean }

/** Full effective flag map for a company (override row, else catalog default). */
export async function getFeatureFlags(
  supabase: SupabaseClient,
  companyId: string | null | undefined,
): Promise<FeatureFlags> {
  const flags: FeatureFlags = {};
  for (const f of FEATURES) flags[f.key] = defaultEnabled(f.key);
  if (!companyId) return flags;
  const { data } = await supabase
    .from('erp_feature_flags')
    .select('feature_key, enabled')
    .eq('company_id', companyId);
  for (const r of (data ?? []) as FlagRow[]) {
    if (r.feature_key in flags) flags[r.feature_key] = r.enabled;
  }
  return flags;
}

/** Convenience guard. */
export function isFeatureEnabled(flags: FeatureFlags, key: string): boolean {
  return flags[key] === true;
}
