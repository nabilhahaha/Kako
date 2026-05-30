'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requirePermission, requireAnyPermission, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { getT } from '@/lib/i18n/server';

/** Create / update a sales route (rep + van + visit day). */
export async function upsertRoute(formData: FormData): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requireAnyPermission(['reports.view', 'customers.manage']);
  if (!ctx.companyId) return { ok: false, error: t('distribution.noCompany') };
  const id = String(formData.get('id') || '').trim();
  const name = String(formData.get('name') || '').trim();
  if (!name) return { ok: false, error: t('distribution.actionRouteNameRequired') };
  const row = {
    name,
    rep_id: String(formData.get('rep_id') || '').trim() || null,
    van_warehouse_id: String(formData.get('van_warehouse_id') || '').trim() || null,
    visit_day: String(formData.get('visit_day') || '').trim() || null,
    is_active: String(formData.get('is_active') || 'true') !== 'false',
  };
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from('erp_routes').update(row).eq('id', id);
    if (error) return { ok: false, error: friendlyDbError(error) };
  } else {
    const { error } = await supabase.from('erp_routes').insert({ ...row, company_id: ctx.companyId });
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  revalidatePath('/distribution/routes');
  return { ok: true };
}

/** Assign a customer to a route (also stamps salesman + visit day from it). */
export async function assignCustomerToRoute(customerId: string, routeId: string | null): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requireAnyPermission(['reports.view', 'customers.manage']);
  if (!ctx.companyId) return { ok: false, error: t('distribution.noCompany') };
  const supabase = await createClient();
  const patch: { route_id: string | null; salesman_id?: string | null; visit_day?: string | null } = { route_id: routeId };
  if (routeId) {
    const { data: r } = await supabase.from('erp_routes').select('rep_id, visit_day').eq('id', routeId).maybeSingle();
    const route = r as { rep_id: string | null; visit_day: string | null } | null;
    if (route) { patch.salesman_id = route.rep_id; patch.visit_day = route.visit_day; }
  }
  const { error } = await supabase.from('erp_customers').update(patch).eq('id', customerId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/distribution/routes');
  return { ok: true };
}

/** Set a rep's monthly sales target + commission %. month = 'YYYY-MM'. */
export async function setTarget(input: { user_id: string; month: string; target_amount: number; commission_pct: number }): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requirePermission('reports.view');
  if (!ctx.companyId) return { ok: false, error: t('distribution.noCompany') };
  if (!input.user_id || !/^\d{4}-\d{2}$/.test(input.month)) return { ok: false, error: t('distribution.actionInvalidData') };
  const supabase = await createClient();
  const { error } = await supabase.from('erp_rep_targets').upsert({
    company_id: ctx.companyId,
    user_id: input.user_id,
    month: `${input.month}-01`,
    target_amount: Number.isFinite(input.target_amount) && input.target_amount >= 0 ? input.target_amount : 0,
    commission_pct: Number.isFinite(input.commission_pct) && input.commission_pct >= 0 ? input.commission_pct : 0,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'company_id,user_id,month' });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/distribution/targets');
  revalidatePath('/distribution/report');
  return { ok: true };
}
