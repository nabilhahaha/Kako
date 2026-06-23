'use server';

// ============================================================================
// FV-3b — company-configurable verification proximity radius. The Company Admin sets the
// radius (in metres) used to decide which assigned customers a rep may verify; field users
// can only READ it. Default = 50 m when no row exists. Server-side enforcement
// (rp-verification-actions.ts) reads this value, never a hardcoded constant. Stored in the
// dedicated additive table erp_rp_verification_settings (0368), company-scoped + RLS.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
// Radius guardrails live in geo-distance.ts: a 'use server' file may only export async fns.
import { NEARBY_RADIUS_M, RADIUS_MIN_M, RADIUS_MAX_M } from '@/lib/erp/geo-distance';

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
type ResultD<T> = { ok: true; data: T } | { ok: false; error: string };

function isCompanyAdmin(ctx: NonNullable<Awaited<ReturnType<typeof getUserContext>>>): boolean {
  return ctx.isPlatformOwner || ctx.isSuperAdmin || ctx.topRole === 'admin';
}

/**
 * The active radius (metres) for the caller's company. Reusable by both the rep UI and the
 * server enforcement path. Returns the default when unset; never throws on a missing row.
 */
export async function getCompanyRadiusM(companyId: string): Promise<number> {
  const sb = await createClient();
  const { data } = await sb.from('erp_rp_verification_settings')
    .select('radius_m').eq('company_id', companyId).maybeSingle();
  const r = data?.radius_m as number | null | undefined;
  return typeof r === 'number' && Number.isFinite(r) ? r : NEARBY_RADIUS_M;
}

/** Read the active radius for display (any company member). */
export async function getVerificationRadius(): Promise<ResultD<{ radiusM: number; isAdmin: boolean }>> {
  const ctx = await getUserContext();
  if (!ctx?.companyId) return { ok: false, error: 'err_unauthorized' };
  const radiusM = await getCompanyRadiusM(ctx.companyId);
  return { ok: true, data: { radiusM, isAdmin: isCompanyAdmin(ctx) } };
}

/** Set the company radius. Company Admin only (DB RLS is the backstop). */
export async function setVerificationRadius(radiusM: number): Promise<Result> {
  const ctx = await getUserContext();
  if (!ctx?.companyId) return { ok: false, error: 'err_unauthorized' };
  if (!isCompanyAdmin(ctx)) return { ok: false, error: 'err_forbidden' };
  const r = Math.round(Number(radiusM));
  if (!Number.isFinite(r) || r < RADIUS_MIN_M || r > RADIUS_MAX_M) return { ok: false, error: 'err_radius_range' };

  const sb = await createClient();
  const { error } = await sb.from('erp_rp_verification_settings')
    .upsert({ company_id: ctx.companyId, radius_m: r, updated_by: ctx.userId, updated_at: new Date().toISOString() },
      { onConflict: 'company_id' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
