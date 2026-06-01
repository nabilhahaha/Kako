'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { getT } from '@/lib/i18n/server';

const KINDS = ['plan', 'trial', 'renew', 'suspend', 'reactivate', 'cancel'];

/** A company admin raises a subscription-change request. Creates the typed
 *  request row, then starts the platform-scope `subscription_change` workflow
 *  (Billing review → Owner approval). The engine + outcome handler apply it. */
export async function requestSubscriptionChange(formData: FormData): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: t('subscriptionRequest.errors.unauthorized') };
  const companyId = ctx.company?.id;
  const isAdmin = ctx.memberships.some((m) => m.role === 'admin');
  if (!companyId || !isAdmin) return { ok: false, error: t('subscriptionRequest.errors.adminOnly') };

  const kind = String(formData.get('kind') || '');
  if (!KINDS.includes(kind)) return { ok: false, error: t('subscriptionRequest.errors.invalidKind') };
  const plan_key = String(formData.get('plan_key') || '').trim() || null;
  const trialRaw = formData.get('trial_days');
  const trial_days = trialRaw ? Math.max(1, Math.floor(Number(trialRaw))) : null;
  const end_date = String(formData.get('end_date') || '').trim() || null;
  const note = String(formData.get('note') || '').trim() || null;

  if (kind === 'plan' && !plan_key) return { ok: false, error: t('subscriptionRequest.errors.planRequired') };
  if (kind === 'renew' && !end_date) return { ok: false, error: t('subscriptionRequest.errors.endRequired') };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('erp_subscription_change_requests')
    .insert({ company_id: companyId, requested_by: ctx.userId, kind, plan_key, trial_days, end_date, note })
    .select('id')
    .single();
  if (error) return { ok: false, error: friendlyDbError(error) };
  const reqId = (data as { id: string }).id;

  const { error: wfErr } = await supabase.rpc('erp_workflow_start', {
    p_key: 'subscription_change', p_entity: 'subscription_change', p_record_id: reqId, p_context: { kind },
  });
  if (wfErr) return { ok: false, error: wfErr.message };

  revalidatePath('/settings/subscription');
  revalidatePath('/requests');
  return { ok: true };
}
