import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { GettingStarted } from '@/components/shared/getting-started';
import { QuickNav, type QuickLink } from '@/components/home/home-widgets';
import { resolveHomePath } from '@/lib/erp/home';
import { hasPermission } from '@/lib/erp/permissions';
import type { UserContext } from '@/lib/erp/auth-context';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { INVOICE_STATUS_LABELS } from '@/lib/erp/constants';
import { formatCurrency, formatDate } from '@/lib/utils';
import { getT } from '@/lib/i18n/server';
import { INTL_LOCALE } from '@/lib/i18n/config';
import type { InvoiceStatus } from '@/lib/erp/types';
import {
  TrendingUp,
  ArrowDownCircle,
  ArrowUpCircle,
  AlertTriangle,
  Receipt,
  PackageX,
  Cpu,
  ShieldQuestion,
  Wrench,
  PackageCheck,
  Wallet,
  UserPlus,
  BarChart3,
  FileText,
} from 'lucide-react';

const ACTIVE_STATUSES: InvoiceStatus[] = ['issued', 'paid', 'partially_paid', 'overdue'];

/** Electrical pack widgets show only for tenants whose roles grant electrical.rma. */
function hasElectricalPermission(ctx: UserContext): boolean {
  return hasPermission(ctx, 'electrical.rma');
}

const STATUS_VARIANT: Record<InvoiceStatus, 'secondary' | 'success' | 'default' | 'destructive' | 'warning'> = {
  draft: 'secondary',
  issued: 'default',
  paid: 'success',
  partially_paid: 'warning',
  cancelled: 'destructive',
  overdue: 'warning',
};

export default async function DashboardPage() {
  const ctx = await getUserContext();
  // The vendor has no tenant company; send them to their portfolio overview.
  if (ctx?.isPlatformOwner) redirect('/platform');
  // A specialised business (clinic, restaurant, …) opens its own home instead of
  // the general sales dashboard.
  if (ctx) {
    const home = resolveHomePath(ctx);
    if (home !== '/dashboard') redirect(home);
  }
  const name = ctx?.profile.full_name || ctx?.profile.email || '';
  const { locale, t } = await getT();
  const intl = INTL_LOCALE[locale];

  const supabase = await createClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const today = now.toISOString().slice(0, 10);

  // Electrical pack widgets: only for tenants whose roles grant electrical.rma
  // (the Electrical/electronics pack). Cheap head-count queries; skipped otherwise.
  const showElectrical = !!ctx && hasElectricalPermission(ctx);
  const electricalStats = showElectrical
    ? await (async () => {
        const [serials, warranties, rmas, supplierReturns] = await Promise.all([
          supabase.from('erp_product_serials').select('id', { count: 'exact', head: true }).eq('status', 'in_stock'),
          supabase.from('erp_warranties').select('id', { count: 'exact', head: true }).eq('is_void', false).gte('end_date', today),
          supabase.from('erp_rma').select('id', { count: 'exact', head: true }).not('status', 'in', '("closed","rejected")'),
          supabase.from('erp_purchase_returns').select('id', { count: 'exact', head: true }),
        ]);
        return {
          serialized: serials.count ?? 0,
          activeWarranties: warranties.count ?? 0,
          openRmas: rmas.count ?? 0,
          supplierReturns: supplierReturns.count ?? 0,
        };
      })()
    : null;

  const [
    { data: monthInvoices },
    { data: recentInvoices },
    { data: customers },
    { data: suppliers },
    { data: products },
    { data: stock },
    { data: overdue },
  ] = await Promise.all([
    supabase.from('erp_invoices').select('net_amount, status').gte('created_at', monthStart),
    supabase
      .from('erp_invoices')
      .select('id, invoice_number, net_amount, paid_amount, status, created_at, customer:erp_customers(name, name_ar)')
      .order('created_at', { ascending: false })
      .limit(6),
    supabase.from('erp_customers').select('balance'),
    supabase.from('erp_suppliers').select('balance'),
    supabase.from('erp_products_catalog').select('id, name, name_ar, min_stock').eq('is_active', true),
    supabase.from('erp_inventory_stock').select('product_id, quantity'),
    supabase
      .from('erp_invoices')
      .select('id', { count: 'exact', head: true })
      .lt('due_date', today)
      .in('status', ['issued', 'partially_paid', 'overdue']),
  ]);

  const monthSales = (monthInvoices ?? [])
    .filter((i) => ACTIVE_STATUSES.includes(i.status as InvoiceStatus))
    .reduce((s, i) => s + Number(i.net_amount), 0);

  const receivables = (customers ?? []).reduce((s, c) => s + Number(c.balance || 0), 0);
  const payables = (suppliers ?? []).reduce((s, c) => s + Number(c.balance || 0), 0);

  // Low-stock: total quantity across warehouses below min_stock (min_stock > 0).
  const qtyByProduct = new Map<string, number>();
  for (const r of stock ?? []) {
    qtyByProduct.set(r.product_id, (qtyByProduct.get(r.product_id) ?? 0) + Number(r.quantity));
  }
  const lowStock = (products ?? [])
    .filter((p) => Number(p.min_stock) > 0 && (qtyByProduct.get(p.id) ?? 0) < Number(p.min_stock))
    .map((p) => ({
      id: p.id,
      name: p.name_ar || p.name,
      qty: qtyByProduct.get(p.id) ?? 0,
      min: Number(p.min_stock),
    }))
    .sort((a, b) => a.qty - b.qty);

  const recent = (recentInvoices ?? []) as unknown as Array<{
    id: string;
    invoice_number: string;
    net_amount: number;
    status: InvoiceStatus;
    created_at: string;
    customer: { name: string; name_ar: string | null } | null;
  }>;

  return (
    <div>
      <PageHeader title={t('dashboard.welcome', { name })} description={t('dashboard.overview')} />

      <GettingStarted
        steps={[
          { label: t('dashboard.stepProduct'), href: '/products', done: (products?.length ?? 0) > 0 },
          { label: t('dashboard.stepCustomer'), href: '/customers', done: (customers?.length ?? 0) > 0 },
          { label: t('dashboard.stepInvoice'), href: '/sales/invoices', done: recent.length > 0 },
        ]}
      />

      {/* U4: one-tap shortcuts to the most common daily actions (role-gated). */}
      {ctx && (() => {
        const quick = ([
          hasPermission(ctx, 'sales.sell') && { label: t('dashboard.qaNewInvoice'), href: '/sales/invoices', icon: FileText },
          hasPermission(ctx, 'sales.collect') && { label: t('dashboard.qaCollect'), href: '/collections', icon: Wallet },
          hasPermission(ctx, 'customers.manage') && { label: t('dashboard.qaNewCustomer'), href: '/customers', icon: UserPlus },
          hasPermission(ctx, 'purchasing.manage') && { label: t('dashboard.qaReceivePO'), href: '/purchases/orders', icon: PackageCheck },
          hasPermission(ctx, 'reports.view') && { label: t('dashboard.qaReports'), href: '/reports', icon: BarChart3 },
        ].filter(Boolean) as QuickLink[]);
        return quick.length > 0 ? <div className="mt-4"><QuickNav links={quick} /></div> : null;
      })()}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('dashboard.monthSales')} value={formatCurrency(monthSales, 'EGP', intl)} icon={TrendingUp} tone="success" href="/sales/invoices" />
        <StatCard label={t('dashboard.receivables')} value={formatCurrency(receivables, 'EGP', intl)} icon={ArrowUpCircle} tone="primary" href="/customers" />
        <StatCard label={t('dashboard.payables')} value={formatCurrency(payables, 'EGP', intl)} icon={ArrowDownCircle} tone="warning" href="/suppliers" />
        <StatCard label={t('dashboard.overdueInvoices')} value={String(overdue ?? 0)} icon={AlertTriangle} tone="destructive" href="/sales/invoices" />
      </div>

      {electricalStats && (
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label={t('electrical.widgetActiveWarranties')} value={String(electricalStats.activeWarranties)} icon={ShieldQuestion} tone="success" href="/electrical/warranties" />
          <StatCard label={t('electrical.widgetOpenRmas')} value={String(electricalStats.openRmas)} icon={Wrench} tone="warning" href="/electrical/rma" />
          <StatCard label={t('electrical.widgetSerializedProducts')} value={String(electricalStats.serialized)} icon={Cpu} tone="primary" href="/electrical/serials" />
          <StatCard label={t('electrical.widgetSupplierReturns')} value={String(electricalStats.supplierReturns)} icon={PackageCheck} tone="primary" href="/purchases/returns" />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="flex items-center gap-2 font-semibold">
                <Receipt className="h-4 w-4" /> {t('dashboard.recentInvoices')}
              </h2>
              <Link href="/sales/invoices" className="text-xs text-primary hover:underline">{t('common.viewAll')}</Link>
            </div>
            {recent.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">{t('dashboard.noInvoices')}</p>
            ) : (
              <ul className="divide-y">
                {recent.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <div className="min-w-0">
                      <span className="font-mono text-xs text-muted-foreground" dir="ltr">{inv.invoice_number}</span>
                      <p className="truncate font-medium">{inv.customer?.name_ar || inv.customer?.name || '—'}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums" dir="ltr">{formatCurrency(inv.net_amount, 'EGP', intl)}</span>
                      <Badge variant={STATUS_VARIANT[inv.status]}>{INVOICE_STATUS_LABELS[inv.status][locale]}</Badge>
                      <span className="hidden text-xs text-muted-foreground sm:inline">{formatDate(inv.created_at, intl)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="flex items-center gap-2 font-semibold">
                <PackageX className="h-4 w-4" /> {t('dashboard.lowStock')}
              </h2>
              <Link href="/products" className="text-xs text-primary hover:underline">{t('dashboard.products')}</Link>
            </div>
            {lowStock.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">{t('dashboard.noLowStock')}</p>
            ) : (
              <ul className="divide-y">
                {lowStock.slice(0, 6).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <p className="truncate font-medium">{p.name}</p>
                    <div className="flex items-center gap-2" dir="ltr">
                      <span className="tabular-nums text-destructive">{p.qty}</span>
                      <span className="text-xs text-muted-foreground">/ {p.min}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
