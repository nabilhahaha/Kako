'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { getT } from '@/lib/i18n/server';

/** A company admin requests onboarding/provisioning (plan + optional trial).
 *  Creates the typed request and starts the platform-scope `onboarding`
 *  workflow (review → owner). The outcome handler provisions on approval. */
export async function requestOnboarding(formData: FormData): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: t('onboardingRequest.errors.unauthorized') };
  const companyId = ctx.company?.id;
  const isAdmin = ctx.memberships.some((m) => m.role === 'admin');
  if (!companyId || !isAdmin) return { ok: false, error: t('onboardingRequest.errors.adminOnly') };

  const plan_key = String(formData.get('plan_key') || '').trim() || null;
  const trialRaw = formData.get('trial_days');
  const trial_days = trialRaw ? Math.max(0, Math.floor(Number(trialRaw))) : null;
  const note = String(formData.get('note') || '').trim() || null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('erp_onboarding_requests')
    .insert({ company_id: companyId, requested_by: ctx.userId, plan_key, trial_days, note })
    .select('id')
    .single();
  if (error) return { ok: false, error: friendlyDbError(error) };
  const reqId = (data as { id: string }).id;

  const { error: wfErr } = await supabase.rpc('erp_workflow_start', {
    p_key: 'onboarding', p_entity: 'onboarding', p_record_id: reqId, p_context: {},
  });
  if (wfErr) return { ok: false, error: wfErr.message };

  revalidatePath('/settings/onboarding');
  revalidatePath('/requests');
  return { ok: true };
}
