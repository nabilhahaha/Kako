import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { effectiveCustomerFrequency } from './customer-frequency';
import { classificationFrequency, type ResolvedFrequency } from './frequency-resolver';
import { DEFAULT_FREQUENCY_RULES, type FrequencyRule } from './frequency';

/**
 * Resolve a customer's effective visit frequency for display (FR-3). Read-only:
 * composes the FR-1 precedence resolver from existing data — customer-level
 * columns (#1, primary), the latest A/B/C outlet grade + company frequency rules
 * (#3 classification recommendation), and the company override policy. Planning
 * (#2) and an explicit system default (#4) are not wired yet (FR-5); the resolver
 * tolerates their absence. RLS-scoped by the caller's client.
 */

async function safeRows<T>(fn: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  try { const { data, error } = await fn(); return error ? [] : ((data as T[]) ?? []); } catch { return []; }
}

/** Embedded grade may arrive as an object or a single-element array (PostgREST). */
function gradeCode(grade: unknown): string | null {
  const g = Array.isArray(grade) ? grade[0] : grade;
  const code = (g as { code?: string } | null)?.code;
  return code ? code.toLowerCase() : null;
}

export async function resolveCustomerFrequency(
  supabase: SupabaseClient,
  customerId: string,
): Promise<ResolvedFrequency> {
  const [custRows, gradeRows, ruleRows, compRows] = await Promise.all([
    safeRows<{ visit_frequency: string | null; visit_frequency_source: 'manual' | 'import' | 'classification' | 'system' | null }>(() =>
      supabase.from('erp_customers').select('visit_frequency, visit_frequency_source').eq('id', customerId).limit(1)),
    safeRows<{ grade: unknown }>(() =>
      supabase.from('erp_outlet_grade_history').select('grade:erp_outlet_grades(code)').eq('customer_id', customerId).order('computed_at', { ascending: false }).limit(1)),
    safeRows<{ classification: string; visits_per_week: number }>(() =>
      supabase.from('erp_visit_frequency_rules').select('classification, visits_per_week').eq('is_active', true)),
    safeRows<{ journey_classification_overrides_frequency: boolean }>(() =>
      supabase.from('erp_companies').select('journey_classification_overrides_frequency').limit(1)),
  ]);

  const customerRow = custRows[0] ?? { visit_frequency: null, visit_frequency_source: null };
  const rules: FrequencyRule[] = ruleRows.length
    ? ruleRows.map((r) => ({ classification: r.classification, visitsPerWeek: Number(r.visits_per_week) }))
    : [...DEFAULT_FREQUENCY_RULES];
  const code = gradeCode(gradeRows[0]?.grade);
  const classification = code ? classificationFrequency(rules, code) : null;
  const classificationCanOverride = !!compRows[0]?.journey_classification_overrides_frequency;

  return effectiveCustomerFrequency({ customerRow, classification, classificationCanOverride });
}
