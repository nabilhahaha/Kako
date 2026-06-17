'use server';

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';

export type FieldUxEventType =
  | 'visit_started'
  | 'visit_completed'
  | 'smart_next_viewed'
  | 'navigate_clicked'
  | 'resume_shown'
  | 'resume_clicked';

// Append a field-UX telemetry event (Smart Next Customer pilot). Best-effort and
// fire-and-forget from the client: only writes while platform.smart_next_customer
// is ON for the company (so disabling the flag stops collection). Never throws to
// the caller. Company-scoped + self-only by RLS.
export async function logFieldUxEvent(input: {
  eventType: FieldUxEventType;
  customerId?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    const ctx = await getUserContext();
    if (!ctx || !ctx.companyId) return;
    if (!hasPermission(ctx, 'field.sales')) return;
    const supabase = await createClient();
    const { data: flag } = await supabase
      .from('erp_feature_flags')
      .select('enabled')
      .eq('company_id', ctx.companyId)
      .eq('feature_key', 'platform.smart_next_customer')
      .maybeSingle();
    if (!(flag as { enabled?: boolean } | null)?.enabled) return;
    await supabase.from('erp_field_ux_events').insert({
      company_id: ctx.companyId,
      user_id: ctx.userId,
      event_type: input.eventType,
      customer_id: input.customerId ?? null,
      meta: input.meta ?? {},
    });
  } catch {
    /* telemetry is best-effort — never affect the user flow */
  }
}
