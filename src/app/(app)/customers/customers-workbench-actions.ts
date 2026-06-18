'use server';

import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { loadCustomerDetailBundle, type CustomerDetailBundle } from './[id]/load';

/**
 * Load one customer's detail bundle (statement · activity · merged 360 timeline)
 * for the Customer Workbench center panel. Auth-gated + RLS-scoped (the same
 * scoping the statement/360 routes already enforce); read-only — no new business
 * logic, permission, RLS, or workflow change.
 */
export async function loadCustomerDetailBundleAction(
  customerId: string,
): Promise<{ ok: true; data: CustomerDetailBundle } | { ok: false; error: string }> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const data = await loadCustomerDetailBundle(supabase, customerId);
  if (!data) return { ok: false, error: 'not_found' };
  return { ok: true, data };
}
