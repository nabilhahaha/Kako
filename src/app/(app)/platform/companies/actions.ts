'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { getPlatformContext, hasPlatformPermission } from '@/lib/erp/platform-context';
import type { PlatformPermission } from '@/lib/erp/platform-permissions';
import { friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { checkBranchLimit, checkUserLimit } from '@/lib/erp/plans';
import * as subscription from '@/lib/erp/subscription-service';
import { logAudit } from '@/lib/erp/audit';
import { ALL_MODULES } from '@/lib/erp/navigation';
import type { BusinessType } from '@/lib/erp/types';
import { getT } from '@/lib/i18n/server';
import { isCompanyMember } from './company-user-guards';

async function requirePlatformOwner() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null, error: t('platform.errors.unauthorized') };
  if (!ctx.isPlatformOwner)
    return { ctx: null, error: t('platform.errors.ownerRequired') };
  return { ctx, error: null };
}

/** Platform-permission guard for staff-accessible vendor actions (owner always
 *  passes). Deeper tenant controls keep requirePlatformOwner(). */
async function requirePlatformPerm(perm: PlatformPermission) {
  const { t } = await getT();
  const pctx = await getPlatformContext();
  if (!pctx || !pctx.isStaff) return { error: t('platform.errors.unauthorized') };
  if (!hasPlatformPermission(pctx, perm)) return { error: t('platform.errors.ownerRequired') };
  return { error: null };
}

function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

const BUSINESS_TYPES: BusinessType[] = [
  'general', 'supermarket', 'pharmacy', 'wholesale',
  'clothing', 'restaurant', 'cafe', 'delivery', 'services',
  'bakery', 'butchery', 'herbalist', 'auto_parts', 'bookstore',
  'electronics', 'laundry', 'workshop', 'clinic', 'salon', 'hotel',
  'field_verification_only', 'route_planner', 'fast_food',
];

/** Create a new tenant company with an optional timed subscription. */
export async function createCompany(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const { error: authErr } = await requirePlatformPerm('create_companies');
  if (authErr) return { ok: false, error: authErr };

  const { t } = await getT();
  const name = String(formData.get('name') || '').trim();
  const name_ar = String(formData.get('name_ar') || '').trim() || null;
  if (!name) return { ok: false, error: t('platform.errors.companyNameRequired') };

  const rawSlug = String(formData.get('slug') || '').trim();
  const slug = rawSlug ? slugify(rawSlug) : slugify(name);
  const btype = String(formData.get('business_type') || 'general') as BusinessType;
  const business_type = BUSINESS_TYPES.includes(btype) ? btype : 'general';
  const subscription_end = String(formData.get('subscription_end') || '').trim() || null;
  // Enriched provisioning metadata (additive columns; plan/trial/status are applied by the
  // caller via the canonical setCompanyPlan/setCompanyTrial/setCompanyActive actions).
  const country = String(formData.get('country') || '').trim() || null;
  const city = String(formData.get('city') || '').trim() || null;
  const trial_starts_at = String(formData.get('trial_start') || '').trim() || null;
  const is_pilot = formData.has('is_pilot');

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('erp_companies')
    .insert({
      name,
      name_ar,
      slug: slug || null,
      business_type,
      country,
      city,
      trial_starts_at,
      is_pilot,
      currency: 'EGP',
      is_active: true,
      allow_self_users: formData.get('_self') ? formData.has('allow_self_users') : true,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return { ok: false, error: t('platform.errors.slugDuplicate') };
    return { ok: false, error: friendlyDbError(error) };
  }
  const newId = (data as { id: string }).id;

  // Apply the module selection from the create form (overrides the business-type
  // defaults seeded by the trigger). Only coarse modules are managed here;
  // item-level ones (pos/returns/…) follow the business type.
  if (formData.get('_modules')) {
    const selected = formData.getAll('modules').map(String);
    const rows = ALL_MODULES.map((m) => ({ company_id: newId, module: m, enabled: selected.includes(m) }));
    await supabase.from('erp_company_modules').upsert(rows, { onConflict: 'company_id,module' });
  }

  // Enable only the chosen roles (within the business type's template). Their
  // permissions are seeded on creation; disabled roles simply can't be used.
  if (formData.get('_roles')) {
    const selectedRoles = formData.getAll('roles').map(String);
    const { data: tmpl } = await supabase.from('erp_business_type_roles').select('role_key').eq('business_type', business_type);
    const roleRows = ((tmpl as { role_key: string }[]) ?? []).map((t) => ({ company_id: newId, role_key: t.role_key, enabled: selectedRoles.includes(t.role_key) }));
    if (roleRows.length > 0) await supabase.from('erp_company_roles').upsert(roleRows, { onConflict: 'company_id,role_key' });
  }

  // Seed the canonical subscription (the single source of truth); the projection
  // trigger fills the erp_companies subscription cache. Any owner-set expiry from
  // the create form is applied through the period-end RPC.
  await subscription.seedSubscription(supabase, {
    companyId: newId, planKey: 'standard', currency: 'EGP', interval: 'monthly', trialDays: 0,
  });
  if (subscription_end) await subscription.setPeriodEnd(supabase, newId, subscription_end);

  await logAudit(supabase, {
    action: 'create',
    entity: 'company',
    entityId: newId,
    details: { name, business_type },
    companyId: newId,
  });
  revalidatePath('/platform/companies');
  return { ok: true, data: { id: newId } };
}

/** Update a company's profile + subscription settings. */
export async function updateCompany(formData: FormData): Promise<ActionResult> {
  const { error: authErr } = await requirePlatformPerm('manage_billing');
  if (authErr) return { ok: false, error: authErr };

  const { t: t2 } = await getT();
  const id = String(formData.get('id') || '').trim();
  if (!id) return { ok: false, error: t2('platform.errors.companyRequired') };
  const name = String(formData.get('name') || '').trim();
  if (!name) return { ok: false, error: t2('platform.errors.companyNameRequired') };

  const btype = String(formData.get('business_type') || 'general') as BusinessType;
  const business_type = BUSINESS_TYPES.includes(btype) ? btype : 'general';

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_companies')
    .update({
      name,
      name_ar: String(formData.get('name_ar') || '').trim() || null,
      business_type,
      // subscription_start / subscription_end are projection-only now (managed via
      // the Subscription tab → canonical billing record). Not written here.
    })
    .eq('id', id);

  if (error) return { ok: false, error: friendlyDbError(error) };
  await logAudit(supabase, { action: 'update', entity: 'company', entityId: id, details: { name }, companyId: id });
  revalidatePath('/platform/companies');
  revalidatePath(`/platform/companies/${id}`);
  return { ok: true };
}

/** Allow / forbid a tenant from managing its own users (else the vendor does). */
export async function setCompanySelfUsers(id: string, allowed: boolean): Promise<ActionResult> {
  const { error: authErr } = await requirePlatformOwner();
  if (authErr) return { ok: false, error: authErr };
  const supabase = await createClient();
  const { error } = await supabase.from('erp_companies').update({ allow_self_users: allowed }).eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  await logAudit(supabase, { action: allowed ? 'enable' : 'disable', entity: 'company_self_users', entityId: id, companyId: id });
  revalidatePath(`/platform/companies/${id}`);
  return { ok: true };
}

/** Suspend or re-activate a tenant (manual lock, independent of expiry). */
export async function setCompanyActive(id: string, isActive: boolean): Promise<ActionResult> {
  const { error: authErr } = await requirePlatformPerm('manage_billing');
  if (authErr) return { ok: false, error: authErr };

  // Canonical write: flip the subscription status; the projection trigger
  // updates the erp_companies.is_active cache.
  const supabase = await createClient();
  const { error } = await subscription.setStatus(supabase, id, isActive ? 'active' : 'suspended');
  if (error) return { ok: false, error: error.message };
  revalidatePath('/platform/companies');
  revalidatePath(`/platform/companies/${id}`);
  return { ok: true };
}

/** Renew/extend a subscription to a new end date. */
export async function setSubscriptionEnd(id: string, end: string): Promise<ActionResult> {
  const { error: authErr } = await requirePlatformPerm('manage_billing');
  if (authErr) return { ok: false, error: authErr };
  const { t: tSub } = await getT();
  if (!end) return { ok: false, error: tSub('platform.errors.subscriptionEndRequired') };

  // Canonical write: set the period end; the projection updates the cache.
  const supabase = await createClient();
  const { error } = await subscription.setPeriodEnd(supabase, id, end);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/platform/companies');
  revalidatePath(`/platform/companies/${id}`);
  return { ok: true };
}

/** Add a branch to a tenant company. */
export async function addBranch(formData: FormData): Promise<ActionResult> {
  const { error: authErr } = await requirePlatformOwner();
  if (authErr) return { ok: false, error: authErr };

  const { t: tBranch } = await getT();
  const company_id = String(formData.get('company_id') || '').trim();
  const code = String(formData.get('code') || '').trim().toUpperCase();
  const name = String(formData.get('name') || '').trim();
  if (!company_id) return { ok: false, error: tBranch('platform.errors.companyRequired') };
  if (!code) return { ok: false, error: tBranch('platform.errors.branchCodeRequired') };
  if (!name) return { ok: false, error: tBranch('platform.errors.branchNameRequired') };

  const supabase = await createClient();
  const limitErr = await checkBranchLimit(supabase, company_id);
  if (limitErr) return { ok: false, error: limitErr };
  const { error } = await supabase.from('erp_branches').insert({
    company_id,
    code,
    name,
    name_ar: String(formData.get('name_ar') || '').trim() || null,
    is_hq: formData.get('is_hq') === 'on',
  });
  if (error) {
    if (error.code === '23505') return { ok: false, error: tBranch('platform.errors.branchCodeDuplicate') };
    return { ok: false, error: friendlyDbError(error) };
  }
  await logAudit(supabase, { action: 'create', entity: 'branch', details: { code, name }, companyId: company_id });
  revalidatePath(`/platform/companies/${company_id}`);
  return { ok: true };
}

/**
 * Onboard a tenant admin: create the auth user (via the edge function) and
 * assign them to a branch of the company as its admin.
 */
export async function onboardAdmin(formData: FormData): Promise<ActionResult> {
  const { error: authErr } = await requirePlatformOwner();
  if (authErr) return { ok: false, error: authErr };

  const { t: tOnboard } = await getT();
  const company_id = String(formData.get('company_id') || '').trim();
  const branch_id = String(formData.get('branch_id') || '').trim();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const full_name = String(formData.get('full_name') || '').trim();
  const role = String(formData.get('role') || 'admin').trim() || 'admin';

  if (!company_id) return { ok: false, error: tOnboard('platform.errors.companyRequired') };
  if (!branch_id) return { ok: false, error: tOnboard('platform.errors.branchRequired') };
  if (!email) return { ok: false, error: tOnboard('platform.errors.emailRequired') };
  if (password.length < 6) return { ok: false, error: tOnboard('platform.errors.passwordTooShort') };

  const supabase = await createClient();

  // Enforce the company's plan user limit before creating a new account.
  const limitErr = await checkUserLimit(supabase, company_id);
  if (limitErr) return { ok: false, error: limitErr };

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { data, error } = await supabase.functions.invoke('admin-create-user', {
    body: { email, password, full_name },
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
  });

  if (error)
    return { ok: false, error: tOnboard('platform.errors.userCreateFailed') };
  if (data?.error) return { ok: false, error: data.error };
  const userId = data?.user_id as string | undefined;
  if (!userId) return { ok: false, error: tOnboard('platform.errors.userIdMissing') };

  const { error: assignErr } = await supabase
    .from('erp_user_branches')
    .upsert(
      { user_id: userId, branch_id, role, is_default: true },
      { onConflict: 'user_id,branch_id' },
    );
  if (assignErr) return { ok: false, error: friendlyDbError(assignErr) };

  await logAudit(supabase, {
    action: 'create',
    entity: 'user',
    entityId: userId,
    details: { email, role, branch_id },
    companyId: company_id,
  });
  revalidatePath(`/platform/companies/${company_id}`);
  return { ok: true };
}

/** Change a company's subscription plan (caps on users/branches/products). */
export async function setCompanyPlan(id: string, planKey: string): Promise<ActionResult> {
  const { error: authErr } = await requirePlatformPerm('manage_billing');
  if (authErr) return { ok: false, error: authErr };
  const { t: tPlan } = await getT();
  if (!id || !planKey) return { ok: false, error: tPlan('platform.errors.incompleteData') };

  // Canonical write: change the plan on the subscription; projection updates cache.
  const supabase = await createClient();
  const { error } = await subscription.changePlan(supabase, id, planKey);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/platform/companies');
  revalidatePath(`/platform/companies/${id}`);
  return { ok: true };
}

/** Reset a tenant user's password (platform owner only). Passwords are hashed
 *  and cannot be read; this sets a new one via the SECURITY DEFINER RPC. */
export async function resetUserPassword(userId: string, newPassword: string): Promise<ActionResult> {
  const { error: authErr } = await requirePlatformOwner();
  if (authErr) return { ok: false, error: authErr };
  const { t: tPwd } = await getT();
  if (!userId) return { ok: false, error: tPwd('platform.errors.userRequired') };
  if (!newPassword || newPassword.length < 6)
    return { ok: false, error: tPwd('platform.errors.passwordTooShort') };

  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_admin_set_password', {
    p_user_id: userId,
    p_new_password: newPassword,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  await logAudit(supabase, { action: 'update', entity: 'user', entityId: userId, details: { password_reset: true } });
  return { ok: true };
}

/** Activate / deactivate a tenant user — company-scoped, owner-gated, audited. The Platform
 *  Owner manages a company's users from /platform Company 360 (general, all companies — no
 *  Route-Planner scoping). Cross-company safe: the target must be a member of THIS company;
 *  self-deactivation is blocked. Flips `erp_profiles.is_active`. */
export async function setCompanyUserActive(companyId: string, userId: string, active: boolean): Promise<ActionResult> {
  const { ctx, error: authErr } = await requirePlatformOwner();
  if (authErr) return { ok: false, error: authErr };
  const { t } = await getT();
  if (!companyId || !userId) return { ok: false, error: t('platform.errors.userRequired') };
  if (ctx && userId === ctx.userId) return { ok: false, error: t('platform.errors.cannotDeactivateSelf') };

  const supabase = await createClient();
  // Verify the target is a member of THIS company before mutating — so a mis-scoped id can
  // never deactivate a user in another tenant.
  const { data: memberships } = await supabase
    .from('erp_user_branches')
    .select('user_id, branch:erp_branches!inner(company_id)')
    .eq('branch.company_id', companyId)
    .eq('user_id', userId);
  if (!isCompanyMember((memberships ?? []) as { user_id: string }[], userId)) {
    return { ok: false, error: t('platform.errors.userNotInCompany') };
  }

  const { error } = await supabase.from('erp_profiles').update({ is_active: active }).eq('id', userId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  await logAudit(supabase, {
    action: active ? 'activate' : 'deactivate',
    entity: 'user',
    entityId: userId,
    details: { active },
    companyId,
  });
  revalidatePath('/platform/companies');
  return { ok: true };
}

/** Put a company on a timed trial (days from today), or clear it (days <= 0).
 *  Independent of the paid subscription_end; an active trial grants access. */
export async function setCompanyTrial(id: string, days: number): Promise<ActionResult> {
  const { error: authErr } = await requirePlatformPerm('manage_billing');
  if (authErr) return { ok: false, error: authErr };
  const { t: tTrial } = await getT();
  if (!id) return { ok: false, error: tTrial('platform.errors.companyRequired') };

  // Canonical write: start/end the trial on the subscription; projection updates
  // erp_companies.trial_ends_at + is_active.
  const supabase = await createClient();
  const { error } = await subscription.setTrial(supabase, id, days);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/platform/companies');
  revalidatePath(`/platform/companies/${id}`);
  return { ok: true };
}

/** Enable / disable a single per-company integration connection (owner toggle).
 *  Does not create connectors or adapters — only flips an existing one's state. */
export async function setIntegrationActive(
  companyId: string,
  integrationId: string,
  active: boolean,
): Promise<ActionResult> {
  const { error: authErr } = await requirePlatformOwner();
  if (authErr) return { ok: false, error: authErr };
  const { t: tInt } = await getT();
  if (!companyId || !integrationId) return { ok: false, error: tInt('platform.errors.incompleteData') };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_integrations')
    .update({ is_active: active })
    .eq('id', integrationId)
    .eq('company_id', companyId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  await logAudit(supabase, {
    action: active ? 'enable' : 'disable',
    entity: 'integration',
    entityId: integrationId,
    companyId,
  });
  revalidatePath(`/platform/companies/${companyId}`);
  return { ok: true };
}

/** Mark a company's onboarding/setup as done or reset it (re-runs setup wizard). */
export async function setCompanySetupDone(id: string, done: boolean): Promise<ActionResult> {
  const { error: authErr } = await requirePlatformOwner();
  if (authErr) return { ok: false, error: authErr };
  const { t: tSetup } = await getT();
  if (!id) return { ok: false, error: tSetup('platform.errors.companyRequired') };

  const supabase = await createClient();
  const { error } = await supabase.from('erp_companies').update({ setup_done: done }).eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  await logAudit(supabase, {
    action: done ? 'enable' : 'disable',
    entity: 'company_setup',
    entityId: id,
    companyId: id,
  });
  revalidatePath(`/platform/companies/${id}`);
  return { ok: true };
}

/** Enable or disable a feature module for a company (overrides the type default). */
export async function setCompanyModule(
  companyId: string,
  module: string,
  enabled: boolean,
): Promise<ActionResult> {
  const { error: authErr } = await requirePlatformOwner();
  if (authErr) return { ok: false, error: authErr };
  const { t: tMod } = await getT();
  if (!companyId || !module) return { ok: false, error: tMod('platform.errors.incompleteData') };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_company_modules')
    .upsert({ company_id: companyId, module, enabled }, { onConflict: 'company_id,module' });
  if (error) return { ok: false, error: friendlyDbError(error) };
  await logAudit(supabase, {
    action: enabled ? 'enable' : 'disable',
    entity: 'company_module',
    entityId: module,
    companyId,
  });
  revalidatePath(`/platform/companies/${companyId}`);
  return { ok: true };
}
