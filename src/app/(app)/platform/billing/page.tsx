import { redirect } from 'next/navigation';
import { getPlatformContext } from '@/lib/erp/platform-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import {
  BillingAdmin, type PlanRow, type PriceRow, type SubRow, type InvoiceRow,
} from './billing-admin';

/** ── Billing administration (Platform Owner only) ──────────────────────────
 *  Multi-currency price book, per-company subscriptions, and invoice history.
 *  Core Platform capability; writes go through owner-gated RPCs. */
export default async function PlatformBillingPage() {
  const { t } = await getT();
  const pctx = await getPlatformContext();
  if (!pctx) redirect('/login');

  if (!pctx.isOwner) {
    return (
      <div>
        <PageHeader title={t('billing.title')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('billing.ownerOnly')}
          </CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: plans }, { data: prices }, { data: subs }, { data: companies }, { data: invoices }] =
    await Promise.all([
      supabase.from('erp_plans').select('key, name_en, name_ar, trial_days, is_active').order('rank', { ascending: false }),
      supabase.from('erp_billing_plan_prices').select('plan_key, currency, interval, amount_minor, is_active'),
      supabase.from('erp_billing_subscriptions').select('company_id, plan_key, currency, interval, status, trial_end, current_period_end'),
      supabase.from('erp_companies').select('id, name, name_ar, country').order('created_at', { ascending: true }),
      supabase.from('erp_billing_invoices').select('id, company_id, number, currency, total_minor, tax_minor, status, issued_at').order('issued_at', { ascending: false }).limit(100),
    ]);

  const companyName = new Map(
    ((companies as { id: string; name: string; name_ar: string | null }[]) ?? []).map((c) => [c.id, c.name_ar || c.name]),
  );

  const subRows: SubRow[] = ((subs as Record<string, unknown>[]) ?? []).map((s) => ({
    companyId: s.company_id as string,
    company: companyName.get(s.company_id as string) ?? (s.company_id as string),
    planKey: s.plan_key as string,
    currency: s.currency as string,
    interval: s.interval as string,
    status: s.status as string,
    trialEnd: (s.trial_end as string) ?? null,
    periodEnd: (s.current_period_end as string) ?? null,
  }));

  const invoiceRows: InvoiceRow[] = ((invoices as Record<string, unknown>[]) ?? []).map((i) => ({
    id: i.id as string,
    company: companyName.get(i.company_id as string) ?? (i.company_id as string),
    number: i.number as string,
    currency: i.currency as string,
    totalMinor: Number(i.total_minor ?? 0),
    taxMinor: Number(i.tax_minor ?? 0),
    status: i.status as string,
    issuedAt: i.issued_at as string,
  }));

  return (
    <div>
      <PageHeader title={t('billing.title')} description={t('billing.subtitle')} />
      <BillingAdmin
        plans={(plans as PlanRow[]) ?? []}
        prices={(prices as PriceRow[]) ?? []}
        subscriptions={subRows}
        companies={((companies as { id: string; name: string; name_ar: string | null }[]) ?? []).map((c) => ({
          id: c.id, name: c.name_ar || c.name,
        }))}
        invoices={invoiceRows}
      />
    </div>
  );
}
