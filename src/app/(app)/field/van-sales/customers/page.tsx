import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { isVanSalesActive } from '@/lib/van-sales/settings-server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { CustomerPicker, type PickerCustomer } from './customer-picker';

export const dynamic = 'force-dynamic';

// F1: customer-first entry for the salesman. Pick a customer → the statement
// (visit context) for that customer, from which Collect / Sell / Return / Print
// branch. Branch-scoped by RLS; gated by field.sales. Read-only (no master-data).
export default async function VanCustomersPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) notFound();
  if (!hasPermission(ctx, 'field.sales') && !ctx.isSuperAdmin) redirect('/dashboard');

  const { t } = await getT();

  const { data: vanRow } = await supabase
    .from('erp_warehouses')
    .select('id, branch_id')
    .eq('is_van', true).eq('assigned_to', ctx.userId).eq('is_active', true)
    .order('code').limit(1).maybeSingle();
  const van = vanRow as { id: string; branch_id: string } | null;

  if (!van) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <BackLink href="/field/van-sales" label={t('vanSales.sell.back')} />
        <PageHeader title={t('vanSales.steps.customer')} description={t('vanSales.pickerSubtitle')} />
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t('vanSales.sell.noVan')}</CardContent></Card>
      </div>
    );
  }

  const [{ data: custData }, { data: openInv }] = await Promise.all([
    supabase
      .from('erp_customers')
      .select('id, name, name_ar, code, balance, credit_limit, payment_terms_days, credit_control_enabled')
      .eq('branch_id', van.branch_id).order('name').limit(500),
    supabase
      .from('erp_invoices')
      .select('customer_id, created_at, net_amount, paid_amount, status')
      .eq('branch_id', van.branch_id).in('status', ['issued', 'partially_paid', 'overdue']),
  ]);

  const oldest = new Map<string, string>();
  for (const r of (openInv ?? []) as { customer_id: string; created_at: string; net_amount: number; paid_amount: number }[]) {
    if (Number(r.net_amount ?? 0) - Number(r.paid_amount ?? 0) <= 0) continue;
    const d = String(r.created_at).slice(0, 10);
    const prev = oldest.get(r.customer_id);
    if (!prev || d < prev) oldest.set(r.customer_id, d);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customers: PickerCustomer[] = ((custData ?? []) as any[]).map((c) => ({
    id: c.id, name: c.name, name_ar: c.name_ar ?? null, code: c.code,
    balance: Number(c.balance ?? 0), credit_limit: Number(c.credit_limit ?? 0),
    payment_terms_days: c.payment_terms_days ?? null, credit_control_enabled: c.credit_control_enabled ?? null,
    oldest_unpaid_date: oldest.get(c.id) ?? null,
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <BackLink href="/field/van-sales" label={t('vanSales.sell.back')} />
      <PageHeader title={t('vanSales.steps.customer')} description={t('vanSales.pickerSubtitle')} />
      <CustomerPicker customers={customers} />
    </div>
  );
}
