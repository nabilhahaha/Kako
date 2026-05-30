import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { GettingStarted } from '@/components/shared/getting-started';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { INVOICE_STATUS_LABELS } from '@/lib/erp/constants';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { InvoiceStatus } from '@/lib/erp/types';
import {
  TrendingUp,
  ArrowDownCircle,
  ArrowUpCircle,
  AlertTriangle,
  Receipt,
  PackageX,
} from 'lucide-react';

const ACTIVE_STATUSES: InvoiceStatus[] = ['issued', 'paid', 'partially_paid', 'overdue'];

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
  const name = ctx?.profile.full_name || ctx?.profile.email || '';

  const supabase = await createClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const today = now.toISOString().slice(0, 10);

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
      <PageHeader title={`أهلاً ${name} 👋`} description="نظرة عامة على نشاط الشركة" />

      <GettingStarted
        steps={[
          { label: 'أضف أول منتج', href: '/products', done: (products?.length ?? 0) > 0 },
          { label: 'أضف أول عميل', href: '/customers', done: (customers?.length ?? 0) > 0 },
          { label: 'أنشئ أول فاتورة', href: '/sales/invoices', done: recent.length > 0 },
        ]}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="مبيعات هذا الشهر" value={formatCurrency(monthSales)} icon={TrendingUp} tone="success" href="/sales/invoices" />
        <StatCard label="مديونيات العملاء" value={formatCurrency(receivables)} icon={ArrowUpCircle} tone="primary" href="/customers" />
        <StatCard label="مستحقات الموردين" value={formatCurrency(payables)} icon={ArrowDownCircle} tone="warning" href="/suppliers" />
        <StatCard label="فواتير متأخرة" value={String(overdue ?? 0)} icon={AlertTriangle} tone="destructive" href="/sales/invoices" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="flex items-center gap-2 font-semibold">
                <Receipt className="h-4 w-4" /> آخر الفواتير
              </h2>
              <Link href="/sales/invoices" className="text-xs text-primary hover:underline">عرض الكل</Link>
            </div>
            {recent.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">لا توجد فواتير بعد.</p>
            ) : (
              <ul className="divide-y">
                {recent.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <div className="min-w-0">
                      <span className="font-mono text-xs text-muted-foreground" dir="ltr">{inv.invoice_number}</span>
                      <p className="truncate font-medium">{inv.customer?.name_ar || inv.customer?.name || '—'}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums" dir="ltr">{formatCurrency(inv.net_amount)}</span>
                      <Badge variant={STATUS_VARIANT[inv.status]}>{INVOICE_STATUS_LABELS[inv.status].ar}</Badge>
                      <span className="hidden text-xs text-muted-foreground sm:inline">{formatDate(inv.created_at)}</span>
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
                <PackageX className="h-4 w-4" /> أصناف تحت حد الطلب
              </h2>
              <Link href="/products" className="text-xs text-primary hover:underline">المنتجات</Link>
            </div>
            {lowStock.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">لا توجد أصناف تحت حد الطلب.</p>
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
