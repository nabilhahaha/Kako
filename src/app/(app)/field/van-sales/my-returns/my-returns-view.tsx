'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, Clock, Check, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { formatCurrency } from '@/lib/utils';
import type { MyReturnRow, MyReturnStatus } from '@/lib/van-sales/returns-server';

const TABS: MyReturnStatus[] = ['pending', 'approved', 'rejected'];
const TAB_META: Record<MyReturnStatus, { key: string; variant: 'warning' | 'success' | 'destructive'; icon: typeof Clock }> = {
  pending: { key: 'tabPending', variant: 'warning', icon: Clock },
  approved: { key: 'tabApproved', variant: 'success', icon: Check },
  rejected: { key: 'tabRejected', variant: 'destructive', icon: X },
};

/** Salesman "My Returns": the rep's requests grouped into Pending / Approved /
 *  Rejected. Each row shows the request facts + approver/decision; rejected rows
 *  show the reason. Tapping a row opens the return detail (print view). */
export function MyReturnsView({ rows }: { rows: MyReturnRow[] }) {
  const { t, locale } = useI18n();
  const intl = INTL_LOCALE[locale];
  const [tab, setTab] = useState<MyReturnStatus>('pending');
  const ml = (k: string) => t(`vanSales.myReturns.${k}`);

  const counts = useMemo(() => ({
    pending: rows.filter((r) => r.status === 'pending').length,
    approved: rows.filter((r) => r.status === 'approved').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
  }), [rows]);

  const list = rows.filter((r) => r.status === tab);
  const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString(intl) : '—');

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 text-sm font-medium">
        {TABS.map((s) => (
          <button key={s} type="button" onClick={() => setTab(s)}
            className={`rounded-md py-1.5 transition-colors ${tab === s ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>
            {ml(TAB_META[s].key)} <span className="opacity-70">({counts[s]})</span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground">{ml('empty')}</CardContent></Card>
      ) : (
        <ul className="space-y-2">
          {list.map((r) => {
            const meta = TAB_META[r.status];
            const Icon = meta.icon;
            return (
              <li key={r.id}>
                <a href={`/sales/returns/${r.id}/print`} target="_blank" rel="noreferrer"
                  className="block rounded-lg border p-3 transition-colors hover:bg-secondary/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">{r.customerName}</span>
                        <Badge variant={r.returnType === 'damage' ? 'destructive' : 'secondary'} className="shrink-0">
                          {ml(r.returnType === 'damage' ? 'typeDamage' : 'typeSaleable')}
                        </Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground" dir="ltr">{r.returnNumber} · {r.customerCode}</div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-bold tabular-nums" dir="ltr">{formatCurrency(r.value, 'EGP', intl)}</span>
                      <Badge variant={meta.variant} className="gap-1"><Icon className="h-3 w-3" /> {ml(`st_${r.status}`)}</Badge>
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <Meta label={ml('colRequested')} value={fmtDate(r.requestedAt)} />
                    {r.status !== 'pending' && <Meta label={ml('colApprover')} value={r.approverName || '—'} />}
                    {r.status !== 'pending' && <Meta label={ml('colDecision')} value={fmtDate(r.decisionAt)} />}
                  </div>

                  {r.status === 'rejected' && r.rejectionReason && (
                    <p className="mt-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                      <span className="font-medium">{ml('rejectionReason')}: </span>{r.rejectionReason}
                    </p>
                  )}

                  <div className="mt-2 flex items-center gap-1 text-xs font-medium text-primary">
                    <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" /> {ml('view')}
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-end font-medium">{value}</span>
    </div>
  );
}
