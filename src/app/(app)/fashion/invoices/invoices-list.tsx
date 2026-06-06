'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import { ListSearch } from '@/components/list-search';
import { EmptyState } from '@/components/shared/empty-state';
import { INVOICE_STATUS_LABELS } from '@/lib/erp/constants';
import { formatCurrency, formatDate } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { useI18n } from '@/lib/i18n/provider';
import type { InvoiceStatus } from '@/lib/erp/types';
import { Printer, FileDown, History, Receipt, Eye, X } from 'lucide-react';

export interface FashionInvoiceRow {
  id: string;
  invoice_number: string;
  status: InvoiceStatus;
  total_amount: number;
  discount_amount: number;
  tax_amount: number;
  net_amount: number;
  paid_amount: number;
  created_at: string;
  customer_id: string | null;
  customer: { name: string; name_ar: string | null; phone: string | null } | null;
}

const STATUS_VARIANT: Record<InvoiceStatus, 'secondary' | 'success' | 'default' | 'destructive' | 'warning'> = {
  draft: 'secondary',
  issued: 'default',
  paid: 'success',
  partially_paid: 'warning',
  cancelled: 'destructive',
  overdue: 'warning',
};

const FILTERS = ['all', 'issued', 'partially_paid', 'paid', 'cancelled'] as const;

export function FashionInvoicesList({
  invoices,
  q,
  status,
  customerId,
  customerName,
  from,
  to,
}: {
  invoices: FashionInvoiceRow[];
  q: string;
  status: string;
  customerId: string | null;
  customerName: string | null;
  from: string;
  to: string;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const intl = INTL_LOCALE[locale];
  const money = (n: number) => formatCurrency(Number(n) || 0, 'EGP', intl);
  const name = (c: FashionInvoiceRow['customer']) =>
    c ? (locale === 'ar' ? c.name_ar || c.name : c.name) : t('fashion.sell.walkIn');

  const statusHref = (val: string) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (customerId) params.set('customer', customerId);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (val !== 'all') params.set('status', val);
    const qs = params.toString();
    return qs ? `/fashion/invoices?${qs}` : '/fashion/invoices';
  };
  // Update a date bound in the URL, preserving the other filters, resetting page.
  const setDate = (key: 'from' | 'to', value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('page');
    const qs = params.toString();
    router.replace(qs ? `/fashion/invoices?${qs}` : '/fashion/invoices');
  };
  const printHref = (id: string, autoPrint = false) => `/print/fashion/invoice/${id}${autoPrint ? '?print=1' : ''}`;

  if (invoices.length === 0 && !q && status === 'all' && !customerId) {
    return (
      <Card>
        <CardContent className="p-4">
          <EmptyState icon={<Receipt />} title={t('fashion.invoices.empty')} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        {customerId && (
          <div className="flex items-center justify-between gap-2 border-b bg-secondary/40 p-3 text-sm">
            <span>
              {t('fashion.invoices.filteredByCustomer')}: <span className="font-medium">{customerName || '—'}</span>
            </span>
            <Link href="/fashion/invoices" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" /> {t('fashion.invoices.clearFilter')}
            </Link>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <ListSearch placeholder={t('fashion.invoices.searchPlaceholder')} className="w-60" />
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>{t('fashion.invoices.dateFrom')}</span>
            <Input type="date" dir="ltr" value={from} onChange={(e) => setDate('from', e.target.value)} className="h-9 w-36" />
            <span>{t('fashion.invoices.dateTo')}</span>
            <Input type="date" dir="ltr" value={to} onChange={(e) => setDate('to', e.target.value)} className="h-9 w-36" />
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((val) => (
              <Link
                key={val}
                href={statusHref(val)}
                className={`rounded-full px-3 py-1 text-xs ${status === val ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}
              >
                {val === 'all' ? t('fashion.invoices.filterAll') : INVOICE_STATUS_LABELS[val][locale]}
              </Link>
            ))}
          </div>
        </div>

        {invoices.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{t('fashion.invoices.noResults')}</p>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="divide-y sm:hidden">
              {invoices.map((inv) => {
                const remaining = Number(inv.net_amount) - Number(inv.paid_amount);
                return (
                  <div key={inv.id} className="space-y-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{name(inv.customer)}</p>
                        <p className="font-mono text-xs text-muted-foreground" dir="ltr">{inv.invoice_number} · {formatDate(inv.created_at, intl)}</p>
                      </div>
                      <Badge variant={STATUS_VARIANT[inv.status]}>{INVOICE_STATUS_LABELS[inv.status][locale]}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" dir="ltr">
                      <span>{t('fashion.invoices.net')}: <span className="tabular-nums text-foreground">{money(inv.net_amount)}</span></span>
                      <span>{t('fashion.invoices.remaining')}: <span className="tabular-nums">{money(remaining)}</span></span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <RowActions id={inv.id} customerId={inv.customer_id} printHref={printHref} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('fashion.invoices.number')}</th>
                    <th className="p-3 text-start font-medium">{t('fashion.invoices.customer')}</th>
                    <th className="p-3 text-start font-medium">{t('fashion.invoices.date')}</th>
                    <th className="p-3 text-end font-medium">{t('fashion.invoices.net')}</th>
                    <th className="p-3 text-end font-medium">{t('fashion.invoices.paid')}</th>
                    <th className="p-3 text-end font-medium">{t('fashion.invoices.remaining')}</th>
                    <th className="p-3 text-center font-medium">{t('fashion.invoices.statusLabel')}</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const remaining = Number(inv.net_amount) - Number(inv.paid_amount);
                    return (
                      <tr key={inv.id} className="border-b last:border-0 hover:bg-secondary/30">
                        <td className="p-3 font-mono text-xs" dir="ltr">{inv.invoice_number}</td>
                        <td className="p-3 font-medium">{name(inv.customer)}</td>
                        <td className="p-3 text-muted-foreground">{formatDate(inv.created_at, intl)}</td>
                        <td className="p-3 text-end tabular-nums" dir="ltr">{money(inv.net_amount)}</td>
                        <td className="p-3 text-end tabular-nums text-success" dir="ltr">{money(inv.paid_amount)}</td>
                        <td className="p-3 text-end tabular-nums" dir="ltr">{money(remaining)}</td>
                        <td className="p-3 text-center">
                          <Badge variant={STATUS_VARIANT[inv.status]}>{INVOICE_STATUS_LABELS[inv.status][locale]}</Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex justify-end gap-1">
                            <RowActions id={inv.id} customerId={inv.customer_id} printHref={printHref} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RowActions({
  id,
  customerId,
  printHref,
}: {
  id: string;
  customerId: string | null;
  printHref: (id: string, autoPrint?: boolean) => string;
}) {
  const { t } = useI18n();
  return (
    <>
      <Tooltip label={t('fashion.invoices.viewDetails')}>
        <Link href={printHref(id)} target="_blank" className="rounded-md p-1.5 hover:bg-secondary" aria-label={t('fashion.invoices.viewDetails')}>
          <Eye className="h-4 w-4" />
        </Link>
      </Tooltip>
      <Tooltip label={t('fashion.invoices.reprint')}>
        <Link href={printHref(id, true)} target="_blank" className="rounded-md p-1.5 hover:bg-secondary" aria-label={t('fashion.invoices.reprint')}>
          <Printer className="h-4 w-4" />
        </Link>
      </Tooltip>
      <Tooltip label={t('fashion.invoices.savePdf')}>
        <Link href={printHref(id, true)} target="_blank" className="rounded-md p-1.5 hover:bg-secondary" aria-label={t('fashion.invoices.savePdf')}>
          <FileDown className="h-4 w-4" />
        </Link>
      </Tooltip>
      {customerId && (
        <Tooltip label={t('fashion.invoices.customerHistory')}>
          <Link href={`/fashion/invoices?customer=${customerId}`} className="rounded-md p-1.5 hover:bg-secondary" aria-label={t('fashion.invoices.customerHistory')}>
            <History className="h-4 w-4" />
          </Link>
        </Tooltip>
      )}
    </>
  );
}
