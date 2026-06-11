'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, type ActionResult } from '@/lib/erp/guards';
import { getUserContext } from '@/lib/erp/auth-context';
import { logAudit } from '@/lib/erp/audit';
import { getFeatureFlags, type FeatureFlags } from '@/lib/erp/feature-flags';
import {
  FEATURES, FEATURES_BY_KEY, FEATURE_TEMPLATES, templateFeatureKeys, type FeatureTemplate,
} from '@/lib/erp/feature-catalog';

/**
 * Tenant feature-configuration write API + a client-callable resolver.
 * Toggles/templates are Company-Admin / Platform-Owner only and company-scoped
 * server-side; RLS independently isolates tenants. Every change is audited.
 */

interface AdminGuard { ok: true; companyId: string; userId: string; supabase: Awaited<ReturnType<typeof createClient>> }

async function requireCompanyAdmin(): Promise<AdminGuard | { ok: false; error: string }> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: 'unauthorized' };
  const isAdmin = ctx.isPlatformOwner === true || ctx.memberships.some((m) => m.role === 'admin');
  if (!isAdmin || !ctx.companyId) return { ok: false, error: 'unauthorized' };
  return { ok: true, companyId: ctx.companyId, userId: ctx.userId, supabase: await createClient() };
}

/** Client-callable: the effective flags for the caller's own company. */
export async function loadFeatureFlags(): Promise<FeatureFlags> {
  const ctx = await getUserContext();
  const supabase = await createClient();
  return getFeatureFlags(supabase, ctx?.companyId);
}

/** Apply a template — materialises a row per catalog feature for the company. */
export async function applyFeatureTemplate(template: string): Promise<ActionResult> {
  const g = await requireCompanyAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  if (!FEATURE_TEMPLATES.includes(template as FeatureTemplate)) return { ok: false, error: 'invalid_template' };
  const { supabase, companyId, userId } = g;

  const enabledKeys = new Set(templateFeatureKeys(template as FeatureTemplate));
  const rows = FEATURES.map((f) => ({
    company_id: companyId, feature_key: f.key, enabled: enabledKeys.has(f.key),
    updated_at: new Date().toISOString(), updated_by: userId,
  }));
  const { error } = await supabase
    .from('erp_feature_flags')
    .upsert(rows, { onConflict: 'company_id,feature_key' });
  if (error) return { ok: false, error: error.message };

  await logAudit(supabase, {
    action: 'update', entity: 'feature_template', entityId: template,
    details: { template, enabled_count: enabledKeys.size }, companyId,
  });
  revalidatePath('/settings/features');
  return { ok: true };
}

/** Toggle a single feature for the company. */
export async function setFeatureFlag(featureKey: string, enabled: boolean): Promise<ActionResult> {
  const g = await requireCompanyAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  if (!FEATURES_BY_KEY[featureKey]) return { ok: false, error: 'unknown_feature' };
  const { supabase, companyId, userId } = g;

  const { error } = await supabase
    .from('erp_feature_flags')
    .upsert(
      { company_id: companyId, feature_key: featureKey, enabled, updated_at: new Date().toISOString(), updated_by: userId },
      { onConflict: 'company_id,feature_key' },
    );
  if (error) return { ok: false, error: error.message };

  await logAudit(supabase, {
    action: enabled ? 'enable' : 'disable', entity: 'feature_flag', entityId: featureKey,
    details: { feature: featureKey, enabled }, companyId,
  });
  revalidatePath('/settings/features');
  return { ok: true };
}
