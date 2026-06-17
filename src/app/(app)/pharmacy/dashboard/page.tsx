import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { formatCurrency } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface DashData {
  today_sales: number; today_invoices: number; today_cash: number; gp_estimate: number; valuation_method?: string;
  low_stock: number; expired: number; near_expiry: number; returns_today: number; adjustments_today: number;
  top_meds: Array<{ name: string; name_ar: string | null; qty: number }>;
  sales_by_user: Array<{ user: string; total: number }>;
}

/** Pharmacy Owner Dashboard — daily KPIs (one RLS-scoped RPC). */
export default async function PharmacyDashboardPage() {
  const { t, locale } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const perms = ctx.permissions as string[];
  if (!(perms.includes('reports.view') || ctx.memberships.some((m) => m.role === 'admin') || ctx.isSuperAdmin)) redirect('/dashboard');

  const supabase = await createClient();
  const { data } = await supabase.rpc('erp_pharmacy_dashboard');
  const d = (data ?? {}) as Partial<DashData>;
  const money = (n: number | undefined) => formatCurrency(Number(n ?? 0), 'EGP', INTL_LOCALE[locale]);
  const nm = (x: { name: string; name_ar: string | null }) => (locale === 'ar' ? x.name_ar || x.name : x.name);

  const kpis: Array<{ label: string; value: string; tone?: string }> = [
    { label: t('pharmDash.todaySales'), value: money(d.today_sales) },
    { label: t('pharmDash.cash'), value: money(d.today_cash) },
    { label: t('pharmDash.gp') + (d.valuation_method ? ` · ${t(`pharmValuation.method.${d.valuation_method}`)}` : ''), value: money(d.gp_estimate) },
    { label: t('pharmDash.invoices'), value: String(d.today_invoices ?? 0) },
    { label: t('pharmDash.lowStock'), value: String(d.low_stock ?? 0), tone: (d.low_stock ?? 0) > 0 ? 'text-amber-600' : '' },
    { label: t('pharmDash.nearExpiry'), value: String(d.near_expiry ?? 0), tone: (d.near_expiry ?? 0) > 0 ? 'text-amber-600' : '' },
    { label: t('pharmDash.expired'), value: String(d.expired ?? 0), tone: (d.expired ?? 0) > 0 ? 'text-destructive' : '' },
    { label: t('pharmDash.returns'), value: String(d.returns_today ?? 0) },
    { label: t('pharmDash.adjustments'), value: String(d.adjustments_today ?? 0) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title={t('pharmDash.title')} description={t('pharmDash.description')} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k.label}><CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">{k.label}</div>
            <div className={`text-xl font-bold ${k.tone ?? ''}`} dir="ltr">{k.value}</div>
          </CardContent></Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardContent className="p-4">
          <h3 className="mb-2 text-sm font-semibold">{t('pharmDash.topMeds')}</h3>
          {(d.top_meds ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('pharmDash.noData')}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {(d.top_meds ?? []).map((m, i) => (
                <li key={i} className="flex justify-between border-b py-1 last:border-0">
                  <span className="truncate">{nm(m)}</span>
                  <span className="tabular-nums text-muted-foreground" dir="ltr">{m.qty}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <h3 className="mb-2 text-sm font-semibold">{t('pharmDash.salesByUser')}</h3>
          {(d.sales_by_user ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('pharmDash.noData')}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {(d.sales_by_user ?? []).map((u, i) => (
                <li key={i} className="flex justify-between border-b py-1 last:border-0">
                  <span className="truncate">{u.user}</span>
                  <span className="tabular-nums" dir="ltr">{money(u.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent></Card>
      </div>
    </div>
  );
}
