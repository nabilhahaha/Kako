import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { getFeatureFlags } from './feature-flags';
import { actionAuthzAllows, actionAuthzEnforced } from './action-authz-core';
import { can } from './capabilities';
import type { UserContext } from './auth-context';

// ─── Backend-Enforcement Phase F — server-action permission guard ─────────────
//
// Several mutating server actions historically enforced only `requireAuth` and
// relied on the hidden UI button + company-scoped RLS for permission. This guard
// adds the missing server-side check WITHOUT changing default behaviour: it is a
// no-op unless `platform.action_authz_enforcement` is enabled for the caller's
// company (default OFF; enabled for the pilot only). Reversible by toggling the
// flag. Reuses the alias-aware `can()` so granular/flat/aliased keys all resolve.

export { ACTION_AUTHZ_FLAG, actionAuthzEnforced, actionAuthzAllows } from './action-authz-core';

/**
 * Server guard for a mutating action. Returns an error `ActionResult` when the
 * caller is denied, else `null` (proceed). No-op unless the company flag is ON.
 * Usage:
 *   const denied = await requireActionPerm(ctx, ['inventory.count']);
 *   if (denied) return denied;
 */
export async function requireActionPerm(
  ctx: UserContext,
  capabilities: string[],
): Promise<{ ok: false; error: string } | null> {
  const apex = ctx.isSuperAdmin || ctx.isPlatformOwner === true;
  if (apex) return null;
  const supabase = await createClient();
  const flags = await getFeatureFlags(supabase, ctx.companyId);
  const enforced = actionAuthzEnforced(flags);
  const holdsAny = capabilities.some((c) => can(ctx, c));
  if (actionAuthzAllows({ apex, enforced, holdsAny })) return null;
  const { t } = await getT();
  return { ok: false, error: t('settings.unauthorized') };
}
