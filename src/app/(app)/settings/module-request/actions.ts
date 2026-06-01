'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { ALL_MODULES } from '@/lib/erp/navigation';
import { getT } from '@/lib/i18n/server';

/** A company admin requests enabling a module / industry pack / integrations
 *  capability. Creates the typed request and starts the platform-scope
 *  `module_request` workflow (review → owner). Outcome enables it on approval. */
export async function requestModuleActivation(formData: FormData): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: t('moduleRequest.errors.unauthorized') };
  const companyId = ctx.company?.id;
  const isAdmin = ctx.memberships.some((m) => m.role === 'admin');
  if (!companyId || !isAdmin) return { ok: false, error: t('moduleRequest.errors.adminOnly') };

  const module_key = String(formData.get('module_key') || '').trim();
  if (!(ALL_MODULES as string[]).includes(module_key)) return { ok: false, error: t('moduleRequest.errors.invalidModule') };
  const note = String(formData.get('note') || '').trim() || null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('erp_module_requests')
    .insert({ company_id: companyId, requested_by: ctx.userId, module_key, enable: true, note })
    .select('id')
    .single();
  if (error) return { ok: false, error: friendlyDbError(error) };
  const reqId = (data as { id: string }).id;

  const { error: wfErr } = await supabase.rpc('erp_workflow_start', {
    p_key: 'module_request', p_entity: 'module_request', p_record_id: reqId, p_context: { module: module_key },
  });
  if (wfErr) return { ok: false, error: wfErr.message };

  revalidatePath('/settings/module-request');
  revalidatePath('/requests');
  return { ok: true };
}
