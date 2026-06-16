'use client';

import { useEffect, useState } from 'react';
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
import { setActiveVisit, clearActiveVisit } from '@/lib/van-sales/active-visit';
import { PendingLink } from '@/components/shared/pending-link';
import { noteVisitOpen, noteVisitClick, endVisitMetrics } from '@/lib/van-sales/visit-metrics';
import { logFieldUxEvent } from '@/lib/van-sales/ux-metrics-server';
import { Printer, HandCoins, ShoppingCart, Undo2, CheckCircle2, ArrowRight, ShieldCheck, AlertTriangle, Ban, History, Navigation, Phone, Lightbulb } from 'lucide-react';
import { googleMapsUrl, appleMapsUrl, wazeUrl, hasValidCoords } from '@/lib/van-sales/map-links';
import { recommendAction, recommendedKind, daysSince } from '@/lib/van-sales/visit-recommendation';

/** Visit context (Phase 1, route-driven): the route stop opened this customer; the
 *  statement is the visit hub and "Complete Visit" returns to the route. */
export interface VisitContext {
  customerId: string;
  seq: number;          // 1-based position on the route
  total: number;        // stops on the route
  nextName?: string | null;
  completeHref: string; // back to the route (next stop highlighted)
  /** Smart Next Customer: record/clear the active-visit marker for Resume Visit. */
  trackResume?: boolean;
  customerName?: string;
  /** How the visit was opened (smart_next | resume | route) — telemetry. */
  source?: string;
}

/** Extra customer context for the field visit cockpit (the rest derives from the
 *  CustomerStatement). Computed server-side by the visit page. */
export interface VisitCockpitData {
  name: string;
  code: string | null;
  area: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  lastVisitDate: string | null;
  lastInvoiceDate: string | null;
  lastInvoiceAmount: number | null;
  salesThisMonth: number;
  salesLastMonth: number;
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
  variant = 'full',
  cockpit,
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
  /** 'field' = mobile salesman VISIT cockpit (customer context + action grid).
   *  'full' (default) = the accounting/admin layout (unchanged). */
  variant?: 'full' | 'field';
  /** Extra customer context for the field visit cockpit (name/code/area/phone/
   *  GPS + last visit/invoice + sales MTD/LM). Balance/credit/overdue/open-count/
   *  oldest-due derive from `statement`. */
  cockpit?: VisitCockpitData;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const intl = INTL_LOCALE[locale];
  const { summary, aging, openInvoices, ledger } = statement;
  const money = (n: number) => formatCurrency(n, 'EGP', intl);
  const showCollect = canCollect && !!collectHref && summary.currentBalance > 0;
  // Level 2 (field) disclosure — collapsed by default so the visit opens action-first.
  const [showDetails, setShowDetails] = useState(false);
  // Credit status, most-severe-first: over the credit limit blocks new sales;
  // overdue is the collection signal; otherwise the account is in good standing.
  const creditStatus: 'good' | 'overdue' | 'overLimit' =
    summary.availableCredit < 0 ? 'overLimit' : summary.overdueAmount > 0 ? 'overdue' : 'good';

  // Complete-Visit guard: block accidental completion while a sale / collection /
  // return was started but not finished — the rep must finish it (clears the flag
  // on success) or explicitly discard it here.
  const [guard, setGuard] = useState<string[] | null>(null);
  const [completing, setCompleting] = useState(false);
  const [noSaleOpen, setNoSaleOpen] = useState(false);
  const [noSaleReason, setNoSaleReason] = useState<string>('shop_closed');
  const [noSaleNote, setNoSaleNote] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const mark = (action: 'sell' | 'collect' | 'return') => {
    if (!visit) return;
    markVisitWork(visit.customerId, action);
    if (visit.trackResume) noteVisitClick();
  };
  // Smart Next: mark this visit active on open (survives app restart → Resume
  // Visit) + telemetry (visit_started once, transitions counted on re-entry).
  useEffect(() => {
    if (!visit?.trackResume) return;
    setActiveVisit(visit.customerId, visit.customerName ?? '');
    if (noteVisitOpen(visit.customerId) === 'started') {
      void logFieldUxEvent({ eventType: 'visit_started', customerId: visit.customerId, meta: { source: visit.source ?? 'route' } });
    }
  }, [visit?.trackResume, visit?.customerId, visit?.customerName, visit?.source]);
  function finishVisit() {
    if (!visit?.trackResume) return;
    const m = endVisitMetrics();
    void logFieldUxEvent({ eventType: 'visit_completed', customerId: visit.customerId, meta: m ?? {} });
    clearActiveVisit();
  }
  function onCompleteVisit() {
    if (!visit || completing) return;
    const pending = listUnfinishedVisitWork(visit.customerId);
    if (pending.length > 0) { setGuard(pending); return; }
    finishVisit();
    setCompleting(true);
    router.push(visit.completeHref);
  }
  // No Sale: complete the visit WITHOUT a transaction, capturing a reason, then
  // advance to the next customer (same completeHref as Complete Visit).
  function confirmNoSale() {
    if (!visit || completing) return;
    if (noSaleReason === 'other' && !noSaleNote.trim()) return;
    clearAllVisitWork(visit.customerId);
    if (visit.trackResume) {
      const m = endVisitMetrics();
      void logFieldUxEvent({ eventType: 'visit_completed', customerId: visit.customerId, meta: { ...(m ?? {}), outcome: 'no_sale', reason: noSaleReason, note: noSaleNote || undefined } });
      clearActiveVisit();
    }
    setNoSaleOpen(false);
    setCompleting(true);
    router.push(visit.completeHref);
  }
  function onDiscardComplete() {
    if (!visit || completing) return;
    clearAllVisitWork(visit.customerId);
    finishVisit();
    setGuard(null);
    setCompleting(true);
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

  // Route banner — visit-driven context (Phase 1). Shared by both layouts.
  const routeBanner = visit ? (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-secondary/40 p-2 text-sm">
      <span className="font-medium">{t('vanSales.visit.stop', { n: visit.seq, total: visit.total })}</span>
      {visit.nextName && <span className="text-muted-foreground">{t('vanSales.visit.next', { name: visit.nextName })}</span>}
    </div>
  ) : null;

  // ── Detail blocks (Level 2 in field mode; always-on in full mode) ──────────
  const agingBlock = (
    <Card>
      <CardContent className="p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">{t('customers.stmtAgingTitle')}</p>
        {/* Mobile (< sm): full-width label↔value rows so currency never clips. */}
        <div className="space-y-1.5 sm:hidden">
          {AGING_BUCKETS.map((b) => (
            <div key={b} className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${b !== 'current' && aging[b] > 0 ? 'border-warning/40 bg-warning/5' : ''}`}>
              <span className="text-xs text-muted-foreground">{t(BUCKET_LABEL[b])}</span>
              <span className="text-sm font-bold tabular-nums" dir="ltr">{money(aging[b])}</span>
            </div>
          ))}
        </div>
        {/* Desktop (sm+): compact 5-bucket grid. */}
        <div className="hidden grid-cols-5 gap-2 text-center sm:grid">
          {AGING_BUCKETS.map((b) => (
            <div key={b} className={`min-w-0 rounded-md border p-2 ${b !== 'current' && aging[b] > 0 ? 'border-warning/40 bg-warning/5' : ''}`}>
              <div className="truncate text-[11px] text-muted-foreground">{t(BUCKET_LABEL[b])}</div>
              <div className="truncate text-sm font-bold tabular-nums" dir="ltr">{money(aging[b])}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  const openInvoicesBlock = (
    <Card>
      <CardContent className="p-0">
        <p className="border-b p-3 text-xs font-medium text-muted-foreground">{t('customers.stmtOpenTitle')} ({summary.openInvoiceCount})</p>
        {openInvoices.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">{t('customers.stmtNoOpen')}</p>
        ) : (
          <>
            {/* Mobile (< sm): stacked cards — invoice number wraps safely. */}
            <ul className="divide-y sm:hidden">
              {openInvoices.map((o) => (
                <li key={o.id} className="space-y-1 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 break-all font-mono text-xs" dir="ltr">{o.invoiceNumber}</span>
                    <Badge variant="secondary" className="shrink-0">{INVOICE_STATUS_LABELS[o.status as InvoiceStatus]?.[locale] ?? o.status}</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">{formatDate(o.date, intl)}{o.daysOverdue > 0 ? ` · ${o.daysOverdue}${locale === 'ar' ? 'ي' : 'd'}` : ''}</span>
                    <span className="font-semibold tabular-nums" dir="ltr">{money(o.outstanding)}</span>
                  </div>
                </li>
              ))}
            </ul>
            {/* Desktop (sm+): full table. */}
            <div className="hidden overflow-x-auto sm:block">
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
                      <td className="break-all p-2 font-mono text-xs" dir="ltr">{o.invoiceNumber}</td>
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
          </>
        )}
      </CardContent>
    </Card>
  );

  const ledgerBlock = (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{t('customers.stmtLedgerTitle')}</p>
      <StatementTable
        entries={entries}
        debitLabel={t('customers.stmtDebitLabel')}
        creditLabel={t('customers.stmtCreditLabel')}
        emptyText={t('customers.stmtEmpty')}
      />
    </div>
  );

  // Visit modals (No-Sale reason sheet + unfinished-work guard) — shared.
  const NO_SALE_REASONS = ['shop_closed', 'no_need', 'owner_absent', 'payment_dispute', 'other'] as const;
  const visitSheets = (
    <>
      {visit && noSaleOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={() => setNoSaleOpen(false)}>
          <div className="w-full max-w-md space-y-3 rounded-t-2xl bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold">{t('vanSales.visit.noSaleTitle')}</h3>
            <div className="space-y-1.5">
              {NO_SALE_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setNoSaleReason(r)}
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm ${noSaleReason === r ? 'border-primary bg-primary/5 font-medium' : ''}`}
                >
                  {t(`vanSales.visit.ns_${r}`)}
                  {noSaleReason === r && <CheckCircle2 className="h-4 w-4 text-primary" />}
                </button>
              ))}
            </div>
            {noSaleReason === 'other' && (
              <textarea
                value={noSaleNote}
                onChange={(e) => setNoSaleNote(e.target.value)}
                placeholder={t('vanSales.visit.noSaleNote')}
                rows={2}
                className="w-full rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setNoSaleOpen(false)}>
                {t('vanSales.visit.keepWorking')}
              </Button>
              <Button variant="destructive" className="flex-1" onClick={confirmNoSale} loading={completing} disabled={noSaleReason === 'other' && !noSaleNote.trim()}>
                {t('vanSales.visit.noSaleConfirm')}
              </Button>
            </div>
          </div>
        </div>
      )}
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
              <Button variant="destructive" className="flex-1" onClick={onDiscardComplete} loading={completing}>
                {completing ? t('common.completing') : t('vanSales.visit.discardComplete')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // Complete-Visit block for the FULL variant (Complete Visit + No Sale buttons).
  const completeVisitBlock = (
    <>
      {visit && (
        <div className="space-y-2">
          <Button className="w-full" size="lg" onClick={onCompleteVisit} loading={completing}>
            {!completing && <CheckCircle2 className="h-4 w-4" />} {completing ? t('common.completing') : t('vanSales.visit.completeVisit')}
          </Button>
          <Button variant="outline" className="w-full" onClick={() => setNoSaleOpen(true)} disabled={completing}>
            <Ban className="h-4 w-4" /> {t('vanSales.visit.noSale')}
          </Button>
        </div>
      )}
      {visitSheets}
    </>
  );

  // ── FIELD VARIANT — VISIT COCKPIT ──────────────────────────────────────────
  // One visit-centric screen: customer context + visit KPIs + a quick-action grid
  // (New Sale / Collection / Return / No Sale / History / Navigate / Call). The
  // rep has everything to decide BEFORE choosing an action; End Visit advances.
  if (variant === 'field') {
    const creditTone =
      creditStatus === 'good'
        ? { badge: 'success' as const, Icon: ShieldCheck, label: t('customers.stmtCreditGood') }
        : creditStatus === 'overLimit'
          ? { badge: 'destructive' as const, Icon: AlertTriangle, label: t('customers.stmtCreditOverLimit') }
          : { badge: 'destructive' as const, Icon: AlertTriangle, label: t('customers.stmtCreditOverdue') };
    const name = cockpit?.name ?? visit?.customerName ?? '—';
    const subtitle = [cockpit?.code, cockpit?.area].filter(Boolean).join(' · ');
    const oldestDueDays = openInvoices.reduce((m, o) => Math.max(m, o.daysOverdue), 0);
    const canNavigate = hasValidCoords(cockpit?.lat, cockpit?.lng);
    const lat = cockpit?.lat as number;
    const lng = cockpit?.lng as number;

    // Recommended next action — guide, don't just inform.
    const reco = recommendAction({
      overdueAmount: summary.overdueAmount,
      availableCredit: summary.availableCredit,
      creditLimit: summary.creditLimit,
      daysSinceLastPurchase: daysSince(cockpit?.lastInvoiceDate ?? null, new Date().toISOString().slice(0, 10)),
    });
    const recoKind = recommendedKind(reco);
    const recoHref = recoKind === 'collect' ? (showCollect ? collectHref : undefined) : recoKind === 'return' ? returnHref : sellHref;
    const recoCta = recoKind === 'collect' ? t('vanSales.cockpit.actCollection') : recoKind === 'return' ? t('vanSales.cockpit.actReturn') : t('vanSales.cockpit.actNewSale');
    const tile = 'flex h-[4.75rem] select-none touch-manipulation flex-col items-center justify-center gap-1 rounded-xl border bg-card text-xs font-medium transition-[transform,background-color] duration-100 active:scale-[0.97] hover:bg-secondary/40 disabled:opacity-40';
    return (
      <div className="space-y-3">
        {routeBanner}

        {/* CUSTOMER CONTEXT */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-lg font-bold leading-tight">{name}</p>
                {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
              </div>
              <Badge variant={creditTone.badge} className="shrink-0 gap-1">
                <creditTone.Icon className="h-3.5 w-3.5" /> {creditTone.label}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <InfoCell label={t('customers.stmtBalanceLabel')} value={money(summary.currentBalance)} tone={summary.currentBalance > 0 ? 'warn' : undefined} />
              <InfoCell label={t('customers.stmtAvailableCredit')} value={money(summary.availableCredit)} tone={summary.availableCredit < 0 ? 'bad' : 'ok'} />
              <InfoCell label={t('vanSales.cockpit.lastInvoice')} value={cockpit?.lastInvoiceDate ? formatDate(cockpit.lastInvoiceDate, intl) : '—'} />
              <InfoCell label={t('vanSales.cockpit.lastInvoiceAmt')} value={cockpit?.lastInvoiceAmount != null ? money(cockpit.lastInvoiceAmount) : '—'} />
              <InfoCell label={t('vanSales.cockpit.lastVisit')} value={cockpit?.lastVisitDate ? formatDate(cockpit.lastVisitDate, intl) : '—'} />
              <InfoCell label={t('customers.stmtSummaryCreditLimit')} value={money(summary.creditLimit)} />
            </div>
          </CardContent>
        </Card>

        {/* RECOMMENDED ACTION — guide the rep to the next best step. */}
        <Card className="border-primary/60 bg-primary/5">
          <CardContent className="flex items-center justify-between gap-3 p-3">
            <div className="flex min-w-0 items-center gap-2">
              <Lightbulb className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">{t('vanSales.cockpit.recommended')}</p>
                <p className="truncate text-sm font-bold">{t(`vanSales.cockpit.reco_${reco}`)}</p>
              </div>
            </div>
            {recoHref && (
              <PendingLink href={recoHref} onClick={() => mark(recoKind)} pendingLabel={t('common.opening')} className={`shrink-0 ${buttonVariants({ size: 'sm' })}`}>
                {recoCta} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </PendingLink>
            )}
          </CardContent>
        </Card>

        {/* VISIT KPIs */}
        <div className="grid grid-cols-3 gap-2">
          <KpiCell label={t('vanSales.cockpit.salesMtd')} value={money(cockpit?.salesThisMonth ?? 0)} />
          <KpiCell label={t('vanSales.cockpit.salesLm')} value={money(cockpit?.salesLastMonth ?? 0)} />
          <KpiCell label={t('vanSales.cockpit.openInv')} value={String(summary.openInvoiceCount)} />
          <KpiCell label={t('customers.stmtOverdueAmount')} value={money(summary.overdueAmount)} tone={summary.overdueAmount > 0 ? 'bad' : undefined} />
          <KpiCell label={t('vanSales.cockpit.oldestDue')} value={oldestDueDays > 0 ? `${oldestDueDays}${locale === 'ar' ? 'ي' : 'd'}` : '—'} tone={oldestDueDays > 0 ? 'warn' : undefined} />
          <KpiCell label={t('vanSales.cockpit.creditLimitShort')} value={money(summary.creditLimit)} />
        </div>

        {/* QUICK ACTIONS */}
        <div className="grid grid-cols-2 gap-2">
          {sellHref && (
            <PendingLink href={sellHref} onClick={() => mark('sell')} pendingLabel={t('common.opening')} className={`${tile} border-primary/40 bg-primary/5 text-primary`}>
              <ShoppingCart className="h-6 w-6" /> {t('vanSales.cockpit.actNewSale')}
            </PendingLink>
          )}
          {showCollect && (
            <PendingLink href={collectHref!} onClick={() => mark('collect')} pendingLabel={t('common.opening')} className={tile}>
              <HandCoins className="h-6 w-6" /> {t('vanSales.cockpit.actCollection')}
            </PendingLink>
          )}
          {returnHref && (
            <PendingLink href={returnHref} onClick={() => mark('return')} pendingLabel={t('common.opening')} className={tile}>
              <Undo2 className="h-6 w-6" /> {t('vanSales.cockpit.actReturn')}
            </PendingLink>
          )}
          <button type="button" onClick={() => setNoSaleOpen(true)} disabled={completing} className={tile}>
            <Ban className="h-6 w-6" /> {t('vanSales.visit.noSale')}
          </button>
          <button type="button" onClick={() => setShowDetails((v) => !v)} aria-expanded={showDetails} className={tile}>
            <History className="h-6 w-6" /> {t('vanSales.cockpit.actHistory')}
          </button>
          <button type="button" onClick={() => canNavigate && setNavOpen(true)} disabled={!canNavigate} className={tile}>
            <Navigation className="h-6 w-6" /> {t('vanSales.smartNext.navigate')}
          </button>
          {cockpit?.phone && (
            <a href={`tel:${cockpit.phone}`} className={tile}>
              <Phone className="h-6 w-6" /> {t('vanSales.cockpit.actCall')}
            </a>
          )}
        </div>

        {/* HISTORY — details on demand: aging · open invoices · movement · print. */}
        {showDetails && (
          <div className="space-y-4">
            {agingBlock}
            {openInvoicesBlock}
            {ledgerBlock}
            <Link href={printHref} target="_blank" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
              <Printer className="h-4 w-4" /> {t('customers.stmtBtnPrint')}
            </Link>
          </div>
        )}

        {/* END VISIT → Next Customer */}
        {visit && (
          <Button className="w-full" size="lg" onClick={onCompleteVisit} loading={completing}>
            {!completing && <ArrowRight className="h-5 w-5 rtl:rotate-180" />} {completing ? t('common.completing') : t('vanSales.cockpit.endVisit')}
          </Button>
        )}
        {visitSheets}

        {/* Navigate sheet */}
        {navOpen && canNavigate && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={() => setNavOpen(false)}>
            <div className="w-full max-w-md space-y-2 rounded-t-2xl bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
              <p className="mb-1 text-sm font-semibold text-muted-foreground">{t('vanSales.smartNext.navigate')}</p>
              <a href={googleMapsUrl(lat, lng)} target="_blank" rel="noopener noreferrer" className={`w-full ${buttonVariants({ variant: 'outline' })}`} onClick={() => setNavOpen(false)}>{t('vanSales.smartNext.navGoogle')}</a>
              <a href={appleMapsUrl(lat, lng)} target="_blank" rel="noopener noreferrer" className={`w-full ${buttonVariants({ variant: 'outline' })}`} onClick={() => setNavOpen(false)}>{t('vanSales.smartNext.navApple')}</a>
              <a href={wazeUrl(lat, lng)} target="_blank" rel="noopener noreferrer" className={`w-full ${buttonVariants({ variant: 'outline' })}`} onClick={() => setNavOpen(false)}>{t('vanSales.smartNext.navWaze')}</a>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── FULL VARIANT (default) — accounting / admin layout (unchanged) ──────────
  return (
    <div className="space-y-4">
      {/* Route banner — visit-driven context (Phase 1). */}
      {routeBanner}

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
          <PendingLink href={collectHref!} onClick={() => mark('collect')} pendingLabel={t('common.opening')} className={buttonVariants({ size: 'sm' })}>
            <HandCoins className="h-4 w-4" /> {t('customers.stmtCollectNow')}
          </PendingLink>
        )}
        {sellHref && (
          <PendingLink href={sellHref} onClick={() => mark('sell')} pendingLabel={t('common.opening')} className={buttonVariants({ size: 'sm' })}>
            <ShoppingCart className="h-4 w-4" /> {t('vanSales.steps.sell')}
          </PendingLink>
        )}
        {returnHref && (
          <PendingLink href={returnHref} onClick={() => mark('return')} pendingLabel={t('common.opening')} className={buttonVariants({ size: 'sm', variant: 'outline' })}>
            <Undo2 className="h-4 w-4" /> {t('vanSales.steps.return')}
          </PendingLink>
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

      {/* Aging buckets · Open invoices · Running ledger */}
      {agingBlock}
      {openInvoicesBlock}
      {ledgerBlock}

      {/* Complete Visit + unfinished-work guard (Phase 1). */}
      {completeVisitBlock}
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

const TONE_CLS: Record<'warn' | 'ok' | 'bad', string> = { warn: 'text-warning', ok: 'text-success', bad: 'text-destructive' };

/** Customer-context cell in the visit cockpit (label + value in a soft box). */
function InfoCell({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'ok' | 'bad' }) {
  return (
    <div className="min-w-0 rounded-lg bg-secondary/40 p-2.5">
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      <p className={`truncate text-sm font-bold tabular-nums ${tone ? TONE_CLS[tone] : ''}`} dir="ltr">{value}</p>
    </div>
  );
}

/** Compact KPI tile in the visit cockpit. */
function KpiCell({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'ok' | 'bad' }) {
  return (
    <div className="min-w-0 rounded-lg border p-2 text-center">
      <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`truncate text-sm font-bold tabular-nums ${tone ? TONE_CLS[tone] : ''}`} dir="ltr">{value}</p>
    </div>
  );
}
