import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { UserContext } from '@/lib/erp/auth-context';
import type { PickerCustomer } from '@/app/(app)/field/van-sales/customers/customer-picker';

// ============================================================================
// Van Sales — customer-picker data (ONE loader). Feeds both the standalone
// picker page and the embedded picker inside the Today workspace, so the two can
// never diverge: branch customers + credit-status inputs (oldest unpaid), Today
// JP membership (erp_today_journey), and the "sold today" marker (today's
// invoices by this rep). Read-only, branch-scoped by RLS. No transaction change.
// ============================================================================

export interface VanCustomerPicker { branchId: string; customers: PickerCustomer[] }

/** Load the rep's van branch + the picker-ready customer list, or null if the rep
 *  has no active van assigned. */
export async function loadVanCustomerPicker(ctx: UserContext): Promise<VanCustomerPicker | null> {
  const supabase = await createClient();
  const { data: vanRow } = await supabase
    .from('erp_warehouses')
    .select('id, branch_id')
    .eq('is_van', true).eq('assigned_to', ctx.userId).eq('is_active', true)
    .order('code').limit(1).maybeSingle();
  const van = vanRow as { id: string; branch_id: string } | null;
  if (!van) return null;

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: custData }, { data: openInv }, { data: journeyRows }, { data: soldRows }] = await Promise.all([
    supabase
      .from('erp_customers')
      .select('id, name, name_ar, code, balance, credit_limit, payment_terms_days, credit_control_enabled')
      .eq('branch_id', van.branch_id).order('name').limit(500),
    supabase
      .from('erp_invoices')
      .select('customer_id, created_at, net_amount, paid_amount, status')
      .eq('branch_id', van.branch_id).in('status', ['issued', 'partially_paid', 'overdue']),
    supabase.rpc('erp_today_journey', { p_salesman: ctx.userId, p_date: today }),
    supabase
      .from('erp_invoices')
      .select('customer_id, status')
      .eq('branch_id', van.branch_id).eq('created_by', ctx.userId)
      .gte('created_at', `${today}T00:00:00`),
  ]);

  const oldest = new Map<string, string>();
  for (const r of (openInv ?? []) as { customer_id: string; created_at: string; net_amount: number; paid_amount: number }[]) {
    if (Number(r.net_amount ?? 0) - Number(r.paid_amount ?? 0) <= 0) continue;
    const d = String(r.created_at).slice(0, 10);
    const prev = oldest.get(r.customer_id);
    if (!prev || d < prev) oldest.set(r.customer_id, d);
  }
  const journeyIds = new Set(((journeyRows ?? []) as { customer_id: string }[]).map((r) => r.customer_id));
  const soldTodayIds = new Set(
    ((soldRows ?? []) as { customer_id: string; status: string }[])
      .filter((r) => r.status !== 'draft' && r.status !== 'void' && r.status !== 'cancelled')
      .map((r) => r.customer_id),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customers: PickerCustomer[] = ((custData ?? []) as any[]).map((c) => ({
    id: c.id, name: c.name, name_ar: c.name_ar ?? null, code: c.code,
    balance: Number(c.balance ?? 0), credit_limit: Number(c.credit_limit ?? 0),
    payment_terms_days: c.payment_terms_days ?? null, credit_control_enabled: c.credit_control_enabled ?? null,
    oldest_unpaid_date: oldest.get(c.id) ?? null,
    in_journey: journeyIds.has(c.id),
    sold_today: soldTodayIds.has(c.id),
  }));

  return { branchId: van.branch_id, customers };
}
