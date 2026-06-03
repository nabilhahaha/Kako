'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { logAudit } from '@/lib/erp/audit';
import { getT } from '@/lib/i18n/server';
import { getIndustryPack, type IndustryPackId } from '@/lib/erp/industry-packs';
import { getPermissionTemplate, composeOnboarding, type PermissionTemplateId } from '@/lib/erp/permission-templates';

/** Company creation is a PLATFORM-OWNER-ONLY operation. A Company Admin can never
 *  create another company (no tenant path reaches this action). */
async function requirePlatformOwner() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null, error: t('platform.errors.unauthorized') };
  if (!ctx.isPlatformOwner) return { ctx: null, error: t('platform.errors.ownerRequired') };
  return { ctx, error: null };
}

function slugify(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

export type CompanyStatus = 'trial' | 'active' | 'suspended';

export interface OnboardingInput {
  basics: {
    name: string;
    nameAr?: string;
    country?: string;
    currency: string;
    locale: string;
    timezone?: string;
    status: CompanyStatus;
    adminEmail: string;
    adminName?: string;
    adminPassword?: string;
  };
  industryPackId: IndustryPackId;
  permissionTemplateId: PermissionTemplateId;
}

export interface OnboardingResult {
  companyId: string;
  adminStatus: 'created' | 'pending';
  summary: { modules: number; roles: number; capabilities: number; limits: number; sectionAccess: number };
}

/**
 * Create a company end-to-end from the onboarding wizard:
 *   company → (triggers seed base roles/modules) → HQ branch → apply the resolved
 *   industry-pack × permission-template (atomic RPC) → create/invite admin →
 *   onboarding checklist → audit.
 * Industry pack and permission template are independent inputs (composed here).
 */
export async function createCompanyOnboarding(input: OnboardingInput): Promise<ActionResult<OnboardingResult>> {
  const { ctx, error: authErr } = await requirePlatformOwner();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'unauthorized' };
  const { t } = await getT();

  const pack = getIndustryPack(input.industryPackId);
  const template = getPermissionTemplate(input.permissionTemplateId);
  if (!pack || !template) return { ok: false, error: t('platform.errors.incompleteData') };

  const name = input.basics.name?.trim();
  const adminEmail = input.basics.adminEmail?.trim().toLowerCase();
  if (!name) return { ok: false, error: t('platform.errors.companyNameRequired') };
  if (!adminEmail) return { ok: false, error: t('platform.errors.emailRequired') };

  const supabase = await createClient();
  const status: CompanyStatus = (['trial', 'active', 'suspended'] as const).includes(input.basics.status) ? input.basics.status : 'active';

  // ── 1. Create the company (AFTER INSERT triggers seed base roles/modules/lookups)
  const { data: created, error: insErr } = await supabase
    .from('erp_companies')
    .insert({
      name,
      name_ar: input.basics.nameAr?.trim() || null,
      slug: slugify(name) || null,
      business_type: pack.businessType,
      currency: (input.basics.currency || 'SAR').trim(),
      country: input.basics.country?.trim() || null,
      locale: (input.basics.locale || 'ar').trim(),
      timezone: input.basics.timezone?.trim() || null,
      status,
      is_active: status !== 'suspended',
      email: adminEmail,
    })
    .select('id')
    .single();
  if (insErr) {
    if (insErr.code === '23505') return { ok: false, error: t('platform.errors.slugDuplicate') };
    return { ok: false, error: friendlyDbError(insErr) };
  }
  const companyId = (created as { id: string }).id;

  // ── 2. Default HQ branch (the admin is linked here).
  const { data: branch } = await supabase
    .from('erp_branches')
    .insert({ company_id: companyId, name: name, code: 'HQ', is_active: true })
    .select('id')
    .single();
  const branchId = (branch as { id: string } | null)?.id ?? null;

  // ── 3. Apply the resolved industry-pack × permission-template, atomically.
  const composed = composeOnboarding(pack, input.permissionTemplateId);
  const { error: tplErr } = await supabase.rpc('erp_apply_company_template', {
    p_company_id: companyId,
    p_payload: composed.payload,
  });
  if (tplErr) {
    // The company exists but the template did not apply — surface clearly so the
    // operator can retry / configure in the Authz Console (no silent partial).
    await logAudit(supabase, { action: 'create', entity: 'company', entityId: companyId, details: { name, template_error: tplErr.message }, companyId });
    return { ok: false, error: friendlyDbError(tplErr) };
  }

  // ── 4. Create / invite the company admin (best-effort: edge function may be
  //       unavailable in some environments → mark pending and continue).
  let adminStatus: 'created' | 'pending' = 'pending';
  const password = input.basics.adminPassword ?? '';
  if (branchId && password.length >= 6) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: fnData, error: fnErr } = await supabase.functions.invoke('admin-create-user', {
        body: { email: adminEmail, password, full_name: input.basics.adminName?.trim() || adminEmail },
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      const userId = (fnData as { user_id?: string } | null)?.user_id;
      if (!fnErr && !(fnData as { error?: string } | null)?.error && userId) {
        await supabase.from('erp_user_branches').upsert(
          { user_id: userId, branch_id: branchId, role: 'admin', is_default: true },
          { onConflict: 'user_id,branch_id' },
        );
        adminStatus = 'created';
        await logAudit(supabase, { action: 'create', entity: 'user', entityId: userId, details: { email: adminEmail, role: 'admin' }, companyId });
      }
    } catch {
      adminStatus = 'pending'; // edge function unavailable → invite later
    }
  }

  // ── 5. Onboarding checklist (mark the admin item done if created).
  const checklistRows = pack.checklist.map((c) => ({
    company_id: companyId,
    item_key: c.itemKey,
    label_en: c.labelEn,
    label_ar: c.labelAr,
    href: c.href,
    sort: c.sort,
    done: c.itemKey === 'invite_admin' && adminStatus === 'created',
  }));
  if (checklistRows.length) {
    await supabase.from('erp_onboarding_checklist').upsert(checklistRows, { onConflict: 'company_id,item_key' });
  }

  // ── 6. Audit the onboarding.
  await logAudit(supabase, {
    action: 'create',
    entity: 'company',
    entityId: companyId,
    details: {
      name,
      industry_pack: pack.id,
      permission_template: template.id,
      admin_email: adminEmail,
      admin_status: adminStatus,
      applied: composed.summary,
    },
    companyId,
  });

  revalidatePath('/platform/companies');
  revalidatePath('/platform/onboarding');
  return { ok: true, data: { companyId, adminStatus, summary: composed.summary } };
}

/** Toggle an onboarding checklist item (company admin or platform owner). */
export async function toggleOnboardingItem(companyId: string, itemKey: string, done: boolean): Promise<ActionResult> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  const isAdmin = ctx.isPlatformOwner || ctx.memberships.some((m) => m.role === 'admin');
  if (!isAdmin) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_onboarding_checklist')
    .update({ done })
    .eq('company_id', companyId)
    .eq('item_key', itemKey);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/platform/companies');
  return { ok: true };
}
