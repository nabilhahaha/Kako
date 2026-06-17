'use server';

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import type { VisitOutcomeKind } from './visit-outcome';

// Persist a visit outcome (transaction or non-transaction) so every visit
// produces a measurable, reportable result. Company-scoped + self-only by RLS.
export async function recordVisitOutcome(input: {
  customerId: string;
  outcome: VisitOutcomeKind;
  reason?: string | null;
  note?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await getUserContext();
    if (!ctx || !ctx.companyId) return { ok: false, error: 'unauthorized' };
    if (!hasPermission(ctx, 'field.sales') && !ctx.isSuperAdmin) return { ok: false, error: 'unauthorized' };
    if (!input.customerId || !input.outcome) return { ok: false, error: 'invalid' };
    const supabase = await createClient();
    const { error } = await supabase.from('erp_visit_outcomes').insert({
      company_id: ctx.companyId,
      salesman_id: ctx.userId,
      customer_id: input.customerId,
      outcome: input.outcome,
      reason: input.reason ?? null,
      note: input.note ?? null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'failed' };
  }
}
