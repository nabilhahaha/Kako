'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { logAudit } from '@/lib/erp/audit';
import { getT } from '@/lib/i18n/server';
import { validatePlan, validatePlanKey, type PlanInput } from '@/lib/erp/plan-admin';
import { ALL_MODULES } from '@/lib/erp/navigation';

// Plans & business-type templates are vendor catalog data — owner-only writes
// (RLS already enforces this; we also guard here for a friendly message + audit).
async function requireOwner() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null, error: t('platform.errors.unauthorized') };
  if (!ctx.isPlatformOwner) return { ctx: null, error: t('platform.errors.ownerRequired') };
  return { ctx, error: null };
}

function revalidate() {
  revalidatePath('/platform/plans');
}

function planRow(input: PlanInput) {
  return {
    key: input.key,
    name_en: input.nameEn.trim(),
    name_ar: input.nameAr.trim(),
    rank: input.rank,
    max_users: input.maxUsers,
    max_branches: input.maxBranches,
    max_products: input.maxProducts,
    storage_limit_mb: input.storageLimitMb,
    trial_days: input.trialDays,
    is_active: input.isActive,
  };
}

export async function createPlan(input: PlanInput): Promise<ActionResult> {
  const { ctx, error } = await requireOwner();
  if (error || !ctx) return { ok: false, error: error! };
  const { t } = await getT();
  const supabase = await createClient();
  const { data: existing } = await supabase.from('erp_plans').select('key');
  const keys = ((existing ?? []) as { key: string }[]).map((r) => r.key);
  if (!validatePlan(input, keys).ok) return { ok: false, error: t('platform.plans.invalid') };
  const { error: e } = await supabase.from('erp_plans').insert(planRow(input));
  if (e) return { ok: false, error: friendlyDbError(e) };
  await logAudit(supabase, { action: 'create', entity: 'plan', entityId: input.key, details: { name: input.nameEn } });
  revalidate();
  return { ok: true };
}

export async function updatePlan(key: string, input: PlanInput): Promise<ActionResult> {
  const { ctx, error } = await requireOwner();
  if (error || !ctx) return { ok: false, error: error! };
  const { t } = await getT();
  const supabase = await createClient();
  const { data: existing } = await supabase.from('erp_plans').select('key');
  const otherKeys = ((existing ?? []) as { key: string }[]).map((r) => r.key).filter((k) => k !== key);
  if (!validatePlan({ ...input, key }, otherKeys).ok) return { ok: false, error: t('platform.plans.invalid') };
  // The PK (key) is immutable on update — patch everything else.
  const { key: _omit, ...patch } = planRow({ ...input, key });
  const { error: e } = await supabase.from('erp_plans').update(patch).eq('key', key);
  if (e) return { ok: false, error: friendlyDbError(e) };
  await logAudit(supabase, { action: 'update', entity: 'plan', entityId: key });
  revalidate();
  return { ok: true };
}

export async function setPlanActive(key: string, active: boolean): Promise<ActionResult> {
  const { ctx, error } = await requireOwner();
  if (error || !ctx) return { ok: false, error: error! };
  const supabase = await createClient();
  const { error: e } = await supabase.from('erp_plans').update({ is_active: active }).eq('key', key);
  if (e) return { ok: false, error: friendlyDbError(e) };
  await logAudit(supabase, { action: active ? 'activate' : 'deactivate', entity: 'plan', entityId: key });
  revalidate();
  return { ok: true };
}

export async function clonePlan(srcKey: string, newKey: string, newNameEn: string, newNameAr: string): Promise<ActionResult> {
  const { ctx, error } = await requireOwner();
  if (error || !ctx) return { ok: false, error: error! };
  const { t } = await getT();
  const supabase = await createClient();
  const { data: src } = await supabase
    .from('erp_plans')
    .select('max_users, max_branches, max_products, storage_limit_mb, trial_days')
    .eq('key', srcKey)
    .maybeSingle();
  if (!src) return { ok: false, error: t('platform.plans.invalid') };
  const s = src as { max_users: number | null; max_branches: number | null; max_products: number | null; storage_limit_mb: number | null; trial_days: number | null };
  const { data: all } = await supabase.from('erp_plans').select('key, rank');
  const keys = ((all ?? []) as { key: string }[]).map((r) => r.key);
  if (!validatePlanKey(newKey, keys).ok) return { ok: false, error: t('platform.plans.invalidKey') };
  const maxRank = Math.max(0, ...((all ?? []) as { rank: number }[]).map((r) => r.rank));
  const row = {
    key: newKey, name_en: newNameEn.trim(), name_ar: newNameAr.trim(), rank: maxRank + 1, is_active: true,
    max_users: s.max_users, max_branches: s.max_branches, max_products: s.max_products,
    storage_limit_mb: s.storage_limit_mb, trial_days: s.trial_days ?? 0,
  };
  const { error: e1 } = await supabase.from('erp_plans').insert(row);
  if (e1) return { ok: false, error: friendlyDbError(e1) };
  const { data: mods } = await supabase.from('erp_plan_modules').select('module').eq('plan_key', srcKey);
  const modRows = ((mods ?? []) as { module: string }[]).map((m) => ({ plan_key: newKey, module: m.module }));
  if (modRows.length) await supabase.from('erp_plan_modules').insert(modRows);
  await logAudit(supabase, { action: 'create', entity: 'plan', entityId: newKey, details: { cloned_from: srcKey } });
  revalidate();
  return { ok: true };
}

/** Replace a plan's module entitlements with `modules` (diffed: insert/delete). */
export async function setPlanModules(key: string, modules: string[]): Promise<ActionResult> {
  const { ctx, error } = await requireOwner();
  if (error || !ctx) return { ok: false, error: error! };
  const supabase = await createClient();
  const valid = modules.filter((m) => (ALL_MODULES as string[]).includes(m));
  const { data: current } = await supabase.from('erp_plan_modules').select('module').eq('plan_key', key);
  const cur = new Set(((current ?? []) as { module: string }[]).map((r) => r.module));
  const next = new Set(valid);
  const added = [...next].filter((m) => !cur.has(m));
  const removed = [...cur].filter((m) => !next.has(m));
  if (removed.length) {
    const { error: e } = await supabase.from('erp_plan_modules').delete().eq('plan_key', key).in('module', removed);
    if (e) return { ok: false, error: friendlyDbError(e) };
  }
  if (added.length) {
    const { error: e } = await supabase.from('erp_plan_modules').insert(added.map((m) => ({ plan_key: key, module: m })));
    if (e) return { ok: false, error: friendlyDbError(e) };
  }
  await logAudit(supabase, { action: 'update', entity: 'plan_modules', entityId: key, details: { added, removed } });
  revalidate();
  return { ok: true };
}

/** Persist a new plan ordering (rank = index). */
export async function reorderPlans(orderedKeys: string[]): Promise<ActionResult> {
  const { ctx, error } = await requireOwner();
  if (error || !ctx) return { ok: false, error: error! };
  const supabase = await createClient();
  for (let i = 0; i < orderedKeys.length; i++) {
    const { error: e } = await supabase.from('erp_plans').update({ rank: i }).eq('key', orderedKeys[i]);
    if (e) return { ok: false, error: friendlyDbError(e) };
  }
  await logAudit(supabase, { action: 'update', entity: 'plan', entityId: 'reorder', details: { order: orderedKeys } });
  revalidate();
  return { ok: true };
}

/** Toggle a module in a business-type template (drives new-company seeding). */
export async function setBusinessTypeModule(businessType: string, module: string, on: boolean): Promise<ActionResult> {
  const { ctx, error } = await requireOwner();
  if (error || !ctx) return { ok: false, error: error! };
  const supabase = await createClient();
  if (on) {
    const { error: e } = await supabase.from('erp_business_type_modules').upsert({ business_type: businessType, module }, { onConflict: 'business_type,module' });
    if (e) return { ok: false, error: friendlyDbError(e) };
  } else {
    const { error: e } = await supabase.from('erp_business_type_modules').delete().eq('business_type', businessType).eq('module', module);
    if (e) return { ok: false, error: friendlyDbError(e) };
  }
  await logAudit(supabase, { action: on ? 'enable' : 'disable', entity: 'business_type_module', entityId: `${businessType}:${module}`, details: { businessType, module } });
  revalidate();
  return { ok: true };
}
