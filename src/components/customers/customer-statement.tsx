'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { StatementTable, type StatementEntry } from '@/components/statement-table';
import { INVOICE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/erp/constants';
import { formatCurrency, formatDate } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { useI18n } from '@/lib/i18n/provider';
import { AGING_BUCKETS, type AgingBucket, type CustomerStatement } from '@/lib/erp/customer-statement';
import type { InvoiceStatus, PaymentMethod } from '@/lib/erp/types';
import { markVisitWork, listUnfinishedVisitWork, clearAllVisitWork } from '@/lib/van-sales/visit-session';
import { Printer, HandCoins, ShoppingCart, Undo2, CheckCircle2, ArrowRight } from 'lucide-react';

/** Visit context (Phase 1, route-driven): the route stop opened this customer; the
 *  statement is the visit hub and "Complete Visit" returns to the route. */
export interface VisitContext {
  customerId: string;
  seq: number;          // 1-based position on the route
  total: number;        // stops on the route
  nextName?: string | null;
  completeHref: string; // back to the route (next stop highlighted)
}

const BUCKET_LABEL: Record<AgingBucket, string> = {
  current: 'accounting.aging.bucketCurrent',
  d30: 'accounting.aging.bucket30',
  d60: 'accounting.aging.bucket60',
  d90: 'accounting.aging.bucket90',
  d90p: 'accounting.aging.bucket90p',
};

/**
 * The customer account statement — summary, aging, open invoices and the running
 * ledger, ALL derived from one CustomerStatement object (the authoritative
 * builder), so screen and print never diverge. Role behaviour is data-driven via
 * props (canCollect / showRecon); the same component serves salesman, supervisor
 * and admin.
 */
export function CustomerStatementView({
  statement,
  printHref,
  collectHref,
  sellHref,
  returnHref,
  canCollect = false,
  showRecon = false,
  visit,
}: {
  statement: CustomerStatement;
  printHref: string;
  /** When provided + canCollect + outstanding > 0, shows the Collect Now action. */
  collectHref?: string;
  /** Field visit context (F2): Sell / Return scoped to this customer. */
  sellHref?: string;
  returnHref?: string;
  canCollect?: boolean;
  /** Admin/accountant: surface the ledger-vs-balance reconciliation check. */
  showRecon?: boolean;
  /** Phase 1 visit-driven route: renders the route banner + Complete Visit. */
  visit?: VisitContext;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const intl = INTL_LOCALE[locale];
  const { summary, aging, openInvoices, ledger } = statement;
  const money = (n: number) => formatCurrency(n, 'EGP', intl);
  const showCollect = canCollect && !!collectHref && summary.currentBalance > 0;

  // Complete-Visit guard: block accidental completion while a sale / collection /
  // return was started but not finished — the rep must finish it (clears the flag
  // on success) or explicitly discard it here.
  const [guard, setGuard] = useState<string[] | null>(null);
  const mark = (action: 'sell' | 'collect' | 'return') => { if (visit) markVisitWork(visit.customerId, action); };
  function onCompleteVisit() {
    if (!visit) return;
    const pending = listUnfinishedVisitWork(visit.customerId);
    if (pending.length > 0) { setGuard(pending); return; }
    router.push(visit.completeHref);
  }
  function onDiscardComplete() {
    if (!visit) return;
    clearAllVisitWork(visit.customerId);
    setGuard(null);
    router.push(visit.completeHref);
  }

  // Map the authoritative ledger to the reusable StatementTable shape.
  const entries: StatementEntry[] = ledger.map((e) => ({
    date: e.date,
    ref: e.ref,
    description:
      e.kind === 'invoice' ? t('customers.stmtDescInvoice')
        : e.kind === 'credit_note' ? t('customers.stmtDescCreditNote')
          : e.kind === 'opening' ? t('customers.stmtOpening')
            : t('customers.stmtDescCollection', { method: e.method ? (PAYMENT_METHOD_LABELS[e.method as PaymentMethod]?.[locale] ?? e.method) : '' }),
    debit: e.debit,
    credit: e.credit,
  }));

  return (
    <div className="space-y-4">
      {/* Route banner — visit-driven context (Phase 1). */}
      {visit && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-secondary/40 p-2 text-sm">
          <span className="font-medium">{t('vanSales.visit.stop', { n: visit.seq, total: visit.total })}</span>
          {visit.nextName && <span className="text-muted-foreground">{t('vanSales.visit.next', { name: visit.nextName })}</span>}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Summary label={t('customers.stmtSummaryBalance')} value={money(summary.currentBalance)} tone={summary.currentBalance > 0 ? 'warn' : 'ok'} />
        <Summary label={t('customers.stmtSummaryCreditLimit')} value={money(summary.creditLimit)} />
        <Summary label={t('customers.stmtAvailableCredit')} value={money(summary.availableCredit)} tone={summary.availableCredit < 0 ? 'warn' : undefined} />
        <Summary label={t('customers.stmtOverdueAmount')} value={money(summary.overdueAmount)} tone={summary.overdueAmount > 0 ? 'warn' : undefined} />
      </div>

      {/* Actions — the visit context: Collect · Sell · Return · Print (F2). */}
      <div className="flex flex-wrap items-center gap-2">
        {showCollect && (
          <Link href={collectHref!} onClick={() => mark('collect')} className={buttonVariants({ size: 'sm' })}>
            <HandCoins className="h-4 w-4" /> {t('customers.stmtCollectNow')}
          </Link>
        )}
        {sellHref && (
          <Link href={sellHref} onClick={() => mark('sell')} className={buttonVariants({ size: 'sm' })}>
            <ShoppingCart className="h-4 w-4" /> {t('vanSales.steps.sell')}
          </Link>
        )}
        {returnHref && (
          <Link href={returnHref} onClick={() => mark('return')} className={buttonVariants({ size: 'sm', variant: 'outline' })}>
            <Undo2 className="h-4 w-4" /> {t('vanSales.steps.return')}
          </Link>
        )}
        <Link href={printHref} target="_blank" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
          <Printer className="h-4 w-4" /> {t('customers.stmtBtnPrint')}
        </Link>
        {showRecon && (
          <Badge variant={statement.reconDelta === 0 ? 'success' : 'destructive'}>
            {statement.reconDelta === 0 ? t('customers.stmtReconOk') : t('customers.stmtReconWarn', { delta: money(statement.reconDelta) })}
          </Badge>
        )}
      </div>

      {/* Aging buckets */}
      <Card>
        <CardContent className="p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t('customers.stmtAgingTitle')}</p>
          <div className="grid grid-cols-5 gap-2 text-center">
            {AGING_BUCKETS.map((b) => (
              <div key={b} className={`rounded-md border p-2 ${b !== 'current' && aging[b] > 0 ? 'border-warning/40 bg-warning/5' : ''}`}>
                <div className="text-[11px] text-muted-foreground">{t(BUCKET_LABEL[b])}</div>
                <div className="text-sm font-bold tabular-nums" dir="ltr">{money(aging[b])}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Open invoices */}
      <Card>
        <CardContent className="p-0">
          <p className="border-b p-3 text-xs font-medium text-muted-foreground">{t('customers.stmtOpenTitle')} ({summary.openInvoiceCount})</p>
          {openInvoices.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">{t('customers.stmtNoOpen')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/40 text-muted-foreground">
                  <tr>
                    <th className="p-2 text-start font-medium">{t('customers.stmtColInvoice')}</th>
                    <th className="p-2 text-start font-medium">{t('customers.stmtColDate')}</th>
                    <th className="p-2 text-end font-medium">{t('customers.stmtColOutstanding')}</th>
                    <th className="p-2 text-center font-medium">{t('customers.stmtColDays')}</th>
                    <th className="p-2 text-center font-medium">{t('customers.stmtColStatus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {openInvoices.map((o) => (
                    <tr key={o.id} className="border-b last:border-0">
                      <td className="p-2 font-mono text-xs" dir="ltr">{o.invoiceNumber}</td>
                      <td className="p-2 text-muted-foreground">{formatDate(o.date, intl)}</td>
                      <td className="p-2 text-end tabular-nums" dir="ltr">{money(o.outstanding)}</td>
                      <td className="p-2 text-center tabular-nums" dir="ltr">{o.daysOverdue > 0 ? o.daysOverdue : '—'}</td>
                      <td className="p-2 text-center">
                        <Badge variant="secondary">
                          {INVOICE_STATUS_LABELS[o.status as InvoiceStatus]?.[locale] ?? o.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Running ledger */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">{t('customers.stmtLedgerTitle')}</p>
        <StatementTable
          entries={entries}
          debitLabel={t('customers.stmtDebitLabel')}
          creditLabel={t('customers.stmtCreditLabel')}
          emptyText={t('customers.stmtEmpty')}
        />
      </div>

      {/* Complete Visit — closes the visit and returns to the route (Phase 1). */}
      {visit && (
        <Button className="w-full" size="lg" onClick={onCompleteVisit}>
          <CheckCircle2 className="h-4 w-4" /> {t('vanSales.visit.completeVisit')}
        </Button>
      )}

      {/* Unfinished-work guard: explicit complete-or-discard before closing. */}
      {visit && guard && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={() => setGuard(null)}>
          <div className="w-full max-w-md rounded-t-2xl bg-background p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-destructive">{t('vanSales.visit.unfinishedTitle')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('vanSales.visit.unfinishedBody', { actions: guard.map((a) => t(`vanSales.visit.w_${a}`)).join('، ') })}
            </p>
            <div className="mt-4 flex items-center gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setGuard(null)}>
                <ArrowRight className="h-4 w-4 rtl:rotate-180" /> {t('vanSales.visit.keepWorking')}
              </Button>
              <Button variant="destructive" className="flex-1" onClick={onDiscardComplete}>
                {t('vanSales.visit.discardComplete')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'ok' }) {
  const cls = tone === 'warn' ? 'text-warning' : tone === 'ok' ? 'text-success' : '';
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold tabular-nums ${cls}`} dir="ltr">{value}</p>
      </CardContent>
    </Card>
  );
}
