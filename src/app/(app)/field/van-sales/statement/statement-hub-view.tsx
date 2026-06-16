'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, FileText, HandCoins, Printer, Share2, User } from 'lucide-react';
import { PendingLink } from '@/components/shared/pending-link';
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { formatCurrency } from '@/lib/utils';
import { shareDocumentPdf } from '@/lib/pdf/share-pdf';
import {
  hubStatus, matchesFilter, sortForCollection,
  type StatementHubCustomer, type HubStatus, type HubFilter,
} from '@/lib/van-sales/statement-hub';

const STATUS_META: Record<HubStatus, { emoji: string; variant: 'destructive' | 'warning' | 'success' | 'outline'; cls?: string; label: string }> = {
  overdue: { emoji: '🔴', variant: 'destructive', label: 'stOverdue' },
  credit_blocked: { emoji: '🟠', variant: 'outline', cls: 'border-orange-500 text-orange-600', label: 'stBlocked' },
  near_due: { emoji: '🟡', variant: 'warning', label: 'stNearDue' },
  healthy: { emoji: '🟢', variant: 'success', label: 'stHealthy' },
};

const FILTERS: HubFilter[] = ['all', 'overdue', 'credit_blocked', 'due_week', 'open_invoices'];
const FILTER_LABEL: Record<HubFilter, string> = {
  all: 'fAll', overdue: 'fOverdue', credit_blocked: 'fBlocked', due_week: 'fDueWeek', open_invoices: 'fOpen',
};

/** Customer Statement hub = a field collection center. Search + collection-priority
 *  sort + quick filters + per-customer financials and actions (open statement,
 *  start collection, print, share PDF, open profile). Credit limit is shown only
 *  when permitted. Pure prioritization lives in lib/van-sales/statement-hub. */
export function StatementHubView({ customers, canViewCreditLimit }: { customers: StatementHubCustomer[]; canViewCreditLimit: boolean }) {
  const { t, locale } = useI18n();
  const intl = INTL_LOCALE[locale];
  const ar = locale === 'ar';
  const today = new Date().toISOString().slice(0, 10);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<HubFilter>('all');
  const [sharing, setSharing] = useState<string | null>(null);
  const cName = (c: StatementHubCustomer) => (ar && c.name_ar ? c.name_ar : c.name);
  const sl = (k: string) => t(`vanSales.statementHub.${k}`);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const filtered = customers.filter((c) =>
      matchesFilter(c, filter, today) &&
      (!s || cName(c).toLowerCase().includes(s) || c.code.toLowerCase().includes(s)));
    return sortForCollection(filtered).slice(0, 200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, filter, customers, ar]);

  // Per-filter counts for the chips (helps the rep see the workload at a glance).
  const counts = useMemo(() => {
    const m = {} as Record<HubFilter, number>;
    for (const f of FILTERS) m[f] = customers.filter((c) => matchesFilter(c, f, today)).length;
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers]);

  async function share(c: StatementHubCustomer) {
    setSharing(c.id);
    try {
      await shareDocumentPdf({ doc: 'statement', id: c.id, filename: `${c.code}-statement.pdf`, title: cName(c) });
    } catch { toast.error(t('vanSales.sell.pdfFailed')); }
    finally { setSharing(null); }
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        {/* Search */}
        <div className="relative">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="ps-9" placeholder={t('vanSales.sell.searchCustomer')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {/* Quick filters */}
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filter === f ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-secondary/50'}`}
            >
              {sl(FILTER_LABEL[f])} <span className="opacity-70">({counts[f]})</span>
            </button>
          ))}
        </div>

        <ul className="space-y-2">
          {list.map((c) => {
            const st = hubStatus(c, today);
            const meta = STATUS_META[st];
            return (
              <li key={c.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{cName(c)}</div>
                    <div className="text-xs text-muted-foreground" dir="ltr">{c.code}</div>
                  </div>
                  <Badge variant={meta.variant} className={`shrink-0 gap-1 ${meta.cls ?? ''}`}>
                    <span aria-hidden>{meta.emoji}</span> {sl(meta.label)}
                  </Badge>
                </div>

                {/* Financials */}
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs" dir="ltr">
                  <Stat label={sl('balance')} value={formatCurrency(c.balance, 'EGP', intl)} />
                  <Stat label={sl('overdue')} value={formatCurrency(c.overdueAmount, 'EGP', intl)} strong={c.overdueAmount > 0} danger={c.overdueAmount > 0} />
                  <Stat label={sl('oldestDue')} value={c.oldestDueDate ?? '—'} />
                  {canViewCreditLimit && <Stat label={sl('creditLimit')} value={c.creditLimit > 0 ? formatCurrency(c.creditLimit, 'EGP', intl) : '—'} />}
                  <Stat label={sl('openCount')} value={String(c.openInvoices)} />
                </div>

                {/* Actions */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <PendingLink href={`/field/van-sales/statement/${c.id}?src=statement`} pendingLabel={t('common.opening')}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground">
                    <FileText className="h-3.5 w-3.5" /> {sl('open')}
                  </PendingLink>
                  <PendingLink href={`/field/van-sales/collect?customer=${c.id}`} pendingLabel={t('common.opening')}
                    className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-secondary/50">
                    <HandCoins className="h-3.5 w-3.5" /> {sl('collect')}
                  </PendingLink>
                  <a href={`/print/statement/${c.id}`} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-secondary/50">
                    <Printer className="h-3.5 w-3.5" /> {sl('print')}
                  </a>
                  <button type="button" onClick={() => share(c)} disabled={sharing === c.id}
                    className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-secondary/50 disabled:opacity-50">
                    <Share2 className="h-3.5 w-3.5" /> {sl('share')}
                  </button>
                  <a href={`/customers/${c.id}`}
                    className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-secondary/50">
                    <User className="h-3.5 w-3.5" /> {sl('profile')}
                  </a>
                </div>
              </li>
            );
          })}
          {list.length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">{sl('empty')}</li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, strong, danger }: { label: string; value: string; strong?: boolean; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${strong ? 'font-semibold' : ''} ${danger ? 'text-destructive' : ''}`}>{value}</span>
    </div>
  );
}
