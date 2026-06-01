'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { friendlyDbError, type ActionResult } from '@/lib/erp/guards';

/** ── Field Execution — route plan actions (FE-3c, supervisor) ───────────────
 *  Gated on the field_ops module; the RPCs and RLS enforce field_ops:plan. */
async function guard(): Promise<boolean> {
  const ctx = await getUserContext();
  return !!ctx?.company?.id && ctx.modules.includes('field_ops');
}
function rev() { revalidatePath('/field/plans'); }

export async function generatePlan(routeId: string, date: string): Promise<ActionResult<{ planId: string; added: number; stops: number }>> {
  if (!(await guard())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('erp_fe_generate_plan', { p_route: routeId, p_date: date });
  if (error) return { ok: false, error: friendlyDbError(error) };
  const d = data as { plan_id: string; added: number; stops: number };
  rev();
  return { ok: true, data: { planId: d.plan_id, added: d.added, stops: d.stops } };
}

export async function publishPlan(planId: string): Promise<ActionResult> {
  if (!(await guard())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_fe_publish_plan', { p_plan: planId });
  if (error) return { ok: false, error: friendlyDbError(error) };
  rev();
  return { ok: true };
}

export async function closePlan(planId: string): Promise<ActionResult> {
  if (!(await guard())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_fe_close_plan', { p_plan: planId });
  if (error) return { ok: false, error: friendlyDbError(error) };
  rev();
  return { ok: true };
}

export async function reorderStops(orderedIds: string[]): Promise<ActionResult> {
  if (!(await guard())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from('erp_fe_route_stops').update({ seq: i + 1 }).eq('id', orderedIds[i]);
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  rev();
  return { ok: true };
}

export async function setStopSkipped(stopId: string, skipped: boolean): Promise<ActionResult> {
  if (!(await guard())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { error } = await supabase.from('erp_fe_route_stops').update({ status: skipped ? 'skipped' : 'planned', due: !skipped }).eq('id', stopId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  rev();
  return { ok: true };
}

export async function setStopPriority(stopId: string, priority: 'A' | 'B' | 'C'): Promise<ActionResult> {
  if (!(await guard())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { error } = await supabase.from('erp_fe_route_stops').update({ priority }).eq('id', stopId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  rev();
  return { ok: true };
}

export async function addStop(planId: string, customerId: string): Promise<ActionResult> {
  if (!(await guard())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { data: plan } = await supabase.from('erp_fe_route_plans').select('company_id').eq('id', planId).single();
  const companyId = (plan as { company_id: string } | null)?.company_id;
  if (!companyId) return { ok: false, error: 'plan not found' };
  const { data: max } = await supabase.from('erp_fe_route_stops').select('seq').eq('plan_id', planId).order('seq', { ascending: false }).limit(1);
  const next = ((max as { seq: number }[] | null)?.[0]?.seq ?? 0) + 1;
  const { error } = await supabase.from('erp_fe_route_stops').insert({ company_id: companyId, plan_id: planId, customer_id: customerId, seq: next, due: true, priority: 'B' });
  if (error) return { ok: false, error: error.code === '23505' ? 'already in plan' : friendlyDbError(error) };
  rev();
  return { ok: true };
}
