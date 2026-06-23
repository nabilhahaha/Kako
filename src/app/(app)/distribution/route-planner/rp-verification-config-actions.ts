'use server';

// ============================================================================
// FV-3 — dropdown sources for the verification form. City/Channel options come from the
// DISTINCT values already on the company's customer dataset (no free typing). FV-4 will
// add admin-configurable lists; until then this keeps the form constrained + company-scoped.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';

type ResultD<T> = { ok: true; data: T } | { ok: false; error: string };

export async function getVerificationConfig(): Promise<ResultD<{ cities: string[]; channels: string[] }>> {
  const ctx = await getUserContext();
  if (!ctx?.companyId) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data, error } = await sb.from('erp_rp_dataset_customers')
    .select('city, channel').eq('company_id', ctx.companyId).limit(5000);
  if (error) return { ok: false, error: error.message };
  const uniq = (vals: (string | null)[]) =>
    [...new Set(vals.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim()))].sort();
  return {
    ok: true,
    data: {
      cities: uniq((data ?? []).map((r) => r.city as string | null)),
      channels: uniq((data ?? []).map((r) => r.channel as string | null)),
    },
  };
}
