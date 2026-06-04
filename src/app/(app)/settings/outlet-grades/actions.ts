'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { logAudit } from '@/lib/erp/audit';
import { loadRetailExecData } from '@/lib/erp/retail-exec-data';
import { perfectStoreScore } from '@/lib/erp/perfect-store';
import {
  gradeCohort, DEFAULT_GRADE_BANDS, DEFAULT_GRADE_WEIGHTS,
  type GradeBand, type FactorWeight,
} from '@/lib/erp/outlet-grade';

/** ── Outlet Grading — company self-management + recompute ───────────────────
 *  Dynamic grade bands + factor weights (company-configurable) and a recompute
 *  that scores every outlet on the company-weighted factors, assigns a band, and
 *  writes a history row (with upgrade/downgrade movement). Guarded grade.manage;
 *  audited. RLS-scoped. */

interface Result<T = unknown> { ok: boolean; error?: string; data?: T }
type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));
const n = (v: unknown, d = 0) => { const x = Number(v); return isNaN(x) ? d : x; };

async function guard() {
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null, error: 'unauthorized' as const };
  if (!hasPermission(ctx, 'grade.manage')) return { ctx: null, error: 'unauthorized' as const };
  return { ctx, error: null };
}

export async function createGrade(input: { code: string; name: string; nameAr?: string; minScore: number; rank: number }): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  if (!input.code?.trim() || !input.name?.trim()) return { ok: false, error: 'code and name required' };
  const supabase = await createClient();
  const { error: e } = await supabase.from('erp_outlet_grades').insert({ code: input.code.trim(), name: input.name.trim(), name_ar: input.nameAr?.trim() || null, min_score: Math.max(0, Math.min(100, n(input.minScore))), rank: n(input.rank) });
  if (e) return { ok: false, error: e.message };
  await logAudit(supabase, { action: 'create', entity: 'outlet_grade', details: { code: input.code } });
  revalidatePath('/settings/outlet-grades');
  return { ok: true };
}

export async function deleteGrade(id: string): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { error: e } = await supabase.from('erp_outlet_grades').delete().eq('id', id);
  if (e) return { ok: false, error: e.message };
  await logAudit(supabase, { action: 'delete', entity: 'outlet_grade', entityId: id });
  revalidatePath('/settings/outlet-grades');
  return { ok: true };
}

export async function setFactorWeight(factor: string, weight: number): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  if (!factor?.trim()) return { ok: false, error: 'factor required' };
  const supabase = await createClient();
  // Upsert on (company_id, factor) — company_id stamped by trigger; match on factor.
  const { data: existing } = await supabase.from('erp_outlet_grade_factors').select('id').eq('factor', factor).maybeSingle();
  if (existing) {
    const { error: e } = await supabase.from('erp_outlet_grade_factors').update({ weight: n(weight) }).eq('id', (existing as { id: string }).id);
    if (e) return { ok: false, error: e.message };
  } else {
    const { error: e } = await supabase.from('erp_outlet_grade_factors').insert({ factor: factor.trim(), weight: n(weight) });
    if (e) return { ok: false, error: e.message };
  }
  revalidatePath('/settings/outlet-grades');
  return { ok: true };
}

/** Create the default A+…D bands + 7 factor weights when none exist yet. */
export async function seedDefaultGrading(): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { data: bands } = await supabase.from('erp_outlet_grades').select('id').limit(1);
  if (!bands || bands.length === 0) {
    await supabase.from('erp_outlet_grades').insert(DEFAULT_GRADE_BANDS.map((b) => ({ code: b.code, name: b.label, min_score: b.minScore, rank: b.rank })));
  }
  const { data: facs } = await supabase.from('erp_outlet_grade_factors').select('id').limit(1);
  if (!facs || facs.length === 0) {
    await supabase.from('erp_outlet_grade_factors').insert(DEFAULT_GRADE_WEIGHTS.map((w) => ({ factor: w.factor, weight: w.weight })));
  }
  await logAudit(supabase, { action: 'create', entity: 'outlet_grade', details: { seed: true } });
  revalidatePath('/settings/outlet-grades');
  return { ok: true };
}

export async function recomputeGrades(): Promise<Result<{ count: number }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();

  const bandsR = ((await supabase.from('erp_outlet_grades').select('id, code, name, min_score, rank').eq('is_active', true)).data ?? []) as Row[];
  const weightsR = ((await supabase.from('erp_outlet_grade_factors').select('factor, weight').eq('is_active', true)).data ?? []) as Row[];
  if (bandsR.length === 0) return { ok: false, error: 'no grade bands' };
  const bands: GradeBand[] = bandsR.map((b) => ({ id: s(b.id), code: s(b.code), label: s(b.code), minScore: n(b.min_score), rank: n(b.rank) }));
  const weights: FactorWeight[] = weightsR.length > 0 ? weightsR.map((w) => ({ factor: s(w.factor), weight: n(w.weight) })) : DEFAULT_GRADE_WEIGHTS;
  const rankById = new Map(bands.map((b) => [b.id, b.rank]));

  // Per-outlet retail metrics (msl/value/soldCount/survey) from the shared builder.
  const data = await loadRetailExecData(supabase, { locale: 'en' });
  if (data.metrics.length === 0) return { ok: false, error: 'no outlets' };
  const universe = Math.max(1, data.productUniverse.length);
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();

  // Extra raw factors: quantity, visit frequency, collection.
  const invR = ((await supabase.from('erp_invoices').select('id, customer_id, net_amount, paid_amount').gte('created_at', since).limit(20000)).data ?? []) as Row[];
  const invIds = invR.map((r) => s(r.id));
  const linesR = invIds.length ? (((await supabase.from('erp_invoice_lines').select('invoice_id, quantity').in('invoice_id', invIds.slice(0, 20000))).data ?? []) as Row[]) : [];
  const custByInv = new Map(invR.map((r) => [s(r.id), s(r.customer_id)]));
  const qtyByCust = new Map<string, number>();
  for (const l of linesR) { const c = custByInv.get(s(l.invoice_id)); if (!c) continue; qtyByCust.set(c, (qtyByCust.get(c) ?? 0) + Math.max(0, n(l.quantity))); }
  const invByCust = new Map<string, number>(); const paidByCust = new Map<string, number>();
  for (const r of invR) { const c = s(r.customer_id); invByCust.set(c, (invByCust.get(c) ?? 0) + Math.max(0, n(r.net_amount))); paidByCust.set(c, (paidByCust.get(c) ?? 0) + Math.max(0, n(r.paid_amount))); }
  const visitsR = ((await supabase.from('erp_visits').select('customer_id').gte('visit_date', since.slice(0, 10)).limit(50000)).data ?? []) as Row[];
  const visitsByCust = new Map<string, number>();
  for (const v of visitsR) { const c = s(v.customer_id); visitsByCust.set(c, (visitsByCust.get(c) ?? 0) + 1); }

  // Previous grade rank per customer (for movement).
  const histR = ((await supabase.from('erp_outlet_grade_history').select('customer_id, grade_id, computed_at').order('computed_at', { ascending: false }).limit(10000)).data ?? []) as Row[];
  const prevRank = new Map<string, number>();
  for (const h of histR) { const c = s(h.customer_id); if (!prevRank.has(c) && h.grade_id) prevRank.set(c, rankById.get(s(h.grade_id)) ?? 0); }

  // Build factor maps.
  const customerIds = data.metrics.map((m) => m.customerId);
  const salesValue = new Map<string, number>(); const quantity = new Map<string, number>(); const visits = new Map<string, number>();
  const mslPct = new Map<string, number>(); const distPct = new Map<string, number>(); const psPct = new Map<string, number>(); const collPct = new Map<string, number>();
  for (const m of data.metrics) {
    const id = m.customerId;
    salesValue.set(id, m.value);
    quantity.set(id, qtyByCust.get(id) ?? 0);
    visits.set(id, visitsByCust.get(id) ?? 0);
    if (m.required > 0) mslPct.set(id, Math.round((m.present / m.required) * 100));
    distPct.set(id, Math.round((m.soldCount / universe) * 100));
    const wPct = m.weightRequired > 0 ? Math.round((m.weightPresent / m.weightRequired) * 100) : null;
    const ps = perfectStoreScore({ mslCompliancePct: wPct, surveyScorePct: m.surveyScorePct });
    if (ps.hasData) psPct.set(id, ps.score);
    const inv = invByCust.get(id) ?? 0; const paid = paidByCust.get(id) ?? 0;
    if (inv > 0) collPct.set(id, Math.min(100, Math.round((paid / inv) * 100)));
  }

  const graded = gradeCohort({
    customerIds,
    rawFactors: { sales_value: salesValue, sales_quantity: quantity, visit_frequency: visits },
    pctFactors: { msl_compliance: mslPct, distribution: distPct, perfect_store: psPct, collection: collPct },
    weights, bands, prevRankByCustomer: prevRank,
  });

  const rows = graded.filter((g) => g.grade).map((g) => ({
    customer_id: g.customerId, grade_id: g.grade!.id, score: g.score, movement: g.movement,
    factors: {
      sales_value: salesValue.get(g.customerId) ?? 0, sales_quantity: quantity.get(g.customerId) ?? 0,
      visit_frequency: visits.get(g.customerId) ?? 0, msl_compliance: mslPct.get(g.customerId) ?? null,
      distribution: distPct.get(g.customerId) ?? null, perfect_store: psPct.get(g.customerId) ?? null,
      collection: collPct.get(g.customerId) ?? null,
    },
    created_by: ctx.userId,
  }));
  if (rows.length === 0) return { ok: false, error: 'nothing to grade' };

  // Insert history in chunks.
  for (let i = 0; i < rows.length; i += 500) {
    const { error: e } = await supabase.from('erp_outlet_grade_history').insert(rows.slice(i, i + 500));
    if (e) return { ok: false, error: e.message };
  }
  await logAudit(supabase, { action: 'update', entity: 'outlet_grade', details: { recomputed: rows.length } });
  revalidatePath('/settings/outlet-grades');
  revalidatePath('/distribution/grading');
  return { ok: true, data: { count: rows.length } };
}
