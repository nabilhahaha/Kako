'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { DEFAULT_FREQUENCY_RULES, type FrequencyRule } from '@/lib/route-optimization/frequency';
import { generateWeeklyPlan, type GenCustomer, type DayPlan } from '@/lib/route-optimization/generator';
import { detectPlanConflicts, type ExistingPlanRow, type PlanConflict } from '@/lib/distribution/journey-plan/proposal';
import { resolveFrequencyForCustomer, type CustomerFrequencyFields } from '@/lib/route-optimization/customer-frequency';
import { frequencyToVisitsPerWeek, frequencyToJourneyEnum, formatFrequency } from '@/lib/route-optimization/visit-frequency';

/** Load the company's visit-frequency rules (classification → visits/week),
 *  falling back to the code defaults when none are configured. Reuse-first: the
 *  erp_visit_frequency_rules table already exists. */
async function loadFrequencyRules(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<FrequencyRule[]> {
  const { data } = await supabase.from('erp_visit_frequency_rules').select('classification, visits_per_week').eq('is_active', true);
  const rows = (data as { classification: string; visits_per_week: number }[] | null) ?? [];
  if (rows.length === 0) return [...DEFAULT_FREQUENCY_RULES];
  return rows.map((r) => ({ classification: r.classification, visitsPerWeek: Number(r.visits_per_week) }));
}

/** Embedded grade may arrive as an object or a single-element array (PostgREST). */
function gradeCode(grade: unknown): string | null {
  const g = Array.isArray(grade) ? grade[0] : grade;
  const code = (g as { code?: string } | null)?.code;
  return code ? code.toLowerCase() : null;
}

/** FR-5: company policy — may classification override a customer-level frequency?
 *  Defaults to false (customer-level stays authoritative). */
async function loadClassificationOverride(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<boolean> {
  const { data } = await supabase.from('erp_companies').select('journey_classification_overrides_frequency').limit(1).maybeSingle();
  return !!(data as { journey_classification_overrides_frequency?: boolean } | null)?.journey_classification_overrides_frequency;
}

export interface JourneyProposal {
  dayPlans: DayPlan[];
  conflicts: PlanConflict[];
  customerNames: Record<string, string>;
  gradedCount: number;
  ungradedCount: number;
  /** FR-5: how many scheduled customers used a customer-level frequency (manual
   *  or import) rather than the classification recommendation. */
  customerLevelCount: number;
}

/** Generate a weekly journey-plan proposal for a route (preview only — no write).
 *  Reuses the route-optimization generator + the company frequency rules + each
 *  outlet's latest A/B/C grade. */
export async function generateJourneyProposal(input: {
  routeId: string;
  workingDays: string[];
}): Promise<{ ok: true; data: JourneyProposal } | { ok: false; error: string }> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'unauthorized' };
  if (!input.routeId || input.workingDays.length === 0) return { ok: false, error: 'invalid_input' };
  const supabase = await createClient();

  // Route members (+ GPS + name), the company rules, latest grades, and existing plans.
  const { data: rc } = await supabase.from('erp_route_customers').select('customer_id, sequence').eq('route_id', input.routeId).order('sequence');
  const memberIds = ((rc as { customer_id: string; sequence: number }[] | null) ?? []).map((r) => r.customer_id);
  if (memberIds.length === 0) return { ok: false, error: 'no_route_customers' };

  const [{ data: custRows }, rules, { data: gradeRows }, { data: existing }, override] = await Promise.all([
    supabase.from('erp_customers').select('id, name, name_ar, latitude, longitude, visit_frequency, visit_frequency_source').in('id', memberIds),
    loadFrequencyRules(supabase),
    supabase
      .from('erp_outlet_grade_history')
      .select('customer_id, computed_at, grade:erp_outlet_grades(code)')
      .in('customer_id', memberIds)
      .order('computed_at', { ascending: false }),
    supabase.from('erp_journey_plans').select('customer_id, day_of_week, route_id').in('customer_id', memberIds),
    loadClassificationOverride(supabase),
  ]);

  const customers = (custRows as (CustomerFrequencyFields & { id: string; name: string; name_ar: string | null; latitude: number | null; longitude: number | null })[] | null) ?? [];
  const customerNames: Record<string, string> = {};
  for (const c of customers) customerNames[c.id] = c.name_ar || c.name;

  // Latest grade code per customer (history is newest-first; first wins).
  const gradeByCustomer = new Map<string, string>();
  for (const g of (gradeRows as { customer_id: string; grade: unknown }[] | null) ?? []) {
    const code = gradeCode(g.grade);
    if (!gradeByCustomer.has(g.customer_id) && code) gradeByCustomer.set(g.customer_id, code);
  }

  // FR-5: resolve each customer's effective frequency (customer-level wins over
  // classification) → visits/week feeds the generator's day spread.
  let customerLevelCount = 0;
  const genCustomers: GenCustomer[] = customers.map((c) => {
    const resolved = resolveFrequencyForCustomer({
      customerRow: c,
      gradeCode: gradeByCustomer.get(c.id) ?? null,
      rules,
      classificationCanOverride: override,
    });
    if (resolved.frequency && (resolved.source === 'manual' || resolved.source === 'import')) customerLevelCount++;
    return {
      customerId: c.id,
      latitude: c.latitude,
      longitude: c.longitude,
      classification: gradeByCustomer.get(c.id) ?? '',
      visitsPerWeek: resolved.frequency ? frequencyToVisitsPerWeek(resolved.frequency) : null,
    };
  });
  const gradedCount = genCustomers.filter((c) => c.visitsPerWeek != null && c.visitsPerWeek > 0).length;

  const dayPlans = generateWeeklyPlan(genCustomers, rules, input.workingDays);
  const conflicts = detectPlanConflicts(dayPlans, (existing as ExistingPlanRow[] | null) ?? []);

  return {
    ok: true,
    data: { dayPlans, conflicts, customerNames, gradedCount, ungradedCount: genCustomers.length - gradedCount, customerLevelCount },
  };
}

/** Apply a generated proposal: upsert erp_journey_plans rows (one per customer ×
 *  scheduled day). RLS scopes the write to the company; the unique key dedupes. */
export async function applyJourneyProposal(input: {
  routeId: string;
  salesmanId: string | null;
  dayPlans: { day: string; customerIds: string[] }[];
}): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'unauthorized' };
  if (!input.routeId) return { ok: false, error: 'invalid_input' };
  const supabase = await createClient();

  // FR-5: resolve each customer's effective frequency (customer-level wins over
  // classification) for the persisted frequency column — same precedence as the
  // preview, so what you generate is what you apply.
  const allIds = [...new Set(input.dayPlans.flatMap((d) => d.customerIds))];
  const safeIds = allIds.length ? allIds : ['00000000-0000-0000-0000-000000000000'];
  const [rules, { data: gradeRows }, { data: custRows }, override] = await Promise.all([
    loadFrequencyRules(supabase),
    supabase
      .from('erp_outlet_grade_history')
      .select('customer_id, computed_at, grade:erp_outlet_grades(code)')
      .in('customer_id', safeIds)
      .order('computed_at', { ascending: false }),
    supabase.from('erp_customers').select('id, visit_frequency, visit_frequency_source').in('id', safeIds),
    loadClassificationOverride(supabase),
  ]);
  const gradeByCustomer = new Map<string, string>();
  for (const g of (gradeRows as { customer_id: string; grade: unknown }[] | null) ?? []) {
    const code = gradeCode(g.grade);
    if (!gradeByCustomer.has(g.customer_id) && code) gradeByCustomer.set(g.customer_id, code);
  }
  const freqByCustomer = new Map<string, CustomerFrequencyFields>();
  for (const c of (custRows as (CustomerFrequencyFields & { id: string })[] | null) ?? []) {
    freqByCustomer.set(c.id, { visit_frequency: c.visit_frequency, visit_frequency_source: c.visit_frequency_source });
  }

  const rows: Record<string, unknown>[] = [];
  for (const dp of input.dayPlans) {
    dp.customerIds.forEach((customerId, i) => {
      const resolved = resolveFrequencyForCustomer({
        customerRow: freqByCustomer.get(customerId) ?? { visit_frequency: null },
        gradeCode: gradeByCustomer.get(customerId) ?? null,
        rules,
        classificationCanOverride: override,
      });
      // FR-6: persist both the legacy enum (back-compat) and the canonical token
      // (annual/custom authoritative). Token null ⇒ enum drives cadence as before.
      const frequency = resolved.frequency ? frequencyToJourneyEnum(resolved.frequency) : 'weekly';
      const frequencyToken = resolved.frequency ? formatFrequency(resolved.frequency) : null;
      rows.push({
        company_id: ctx.companyId,
        route_id: input.routeId,
        customer_id: customerId,
        salesman_id: input.salesmanId || null,
        day_of_week: dp.day,
        frequency,
        frequency_token: frequencyToken,
        sequence: i,
        status: 'active',
        updated_by: ctx.userId,
      });
    });
  }
  if (rows.length === 0) return { ok: false, error: 'nothing_to_apply' };

  const { error } = await supabase
    .from('erp_journey_plans')
    .upsert(rows, { onConflict: 'company_id,customer_id,day_of_week,route_id' });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/distribution/journey-plan');
  revalidatePath('/sales/journey');
  return { ok: true };
}

/** Save (replace) the company's visit-frequency rules — company-configurable,
 *  no hardcoded values. Deactivates rules not in the new set. */
export async function saveFrequencyRules(rules: { classification: string; visitsPerWeek: number }[]): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'unauthorized' };
  const supabase = await createClient();
  const clean = rules
    .map((r) => ({ classification: String(r.classification || '').trim().toLowerCase(), visitsPerWeek: Number(r.visitsPerWeek) }))
    .filter((r) => r.classification && Number.isFinite(r.visitsPerWeek) && r.visitsPerWeek >= 0);
  // Replace the company's rules (no unique constraint on the table → delete+insert).
  await supabase.from('erp_visit_frequency_rules').delete().eq('company_id', ctx.companyId);
  if (clean.length > 0) {
    const { error } = await supabase
      .from('erp_visit_frequency_rules')
      .insert(clean.map((r) => ({ company_id: ctx.companyId, classification: r.classification, visits_per_week: r.visitsPerWeek, is_active: true })));
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  revalidatePath('/distribution/journey-plan');
  return { ok: true };
}
