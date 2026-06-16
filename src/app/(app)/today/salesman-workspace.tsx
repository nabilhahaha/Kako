import { type ReactNode } from 'react';
import Link from 'next/link';
import {
  Play, CheckCircle2, Lock, Clock, MapPin,
  UserSquare, Boxes, BarChart3,
} from 'lucide-react';
import { getT } from '@/lib/i18n/server';
import type { UserContext } from '@/lib/erp/auth-context';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { loadVanDayState, loadDayReopenGate } from '@/lib/van-sales/day-server';
import type { VanDayState } from '@/lib/van-sales/day';
import { loadNextCandidates } from '@/lib/van-sales/next-customer-server';
import type { FeatureFlags } from '@/lib/erp/feature-flags';
import { smartNextCustomerEnabled, dailySummaryEnabled, stockMovementReportEnabled } from '@/lib/van-sales/sell';
import { ReopenRequestForm } from '@/app/(app)/field/van-sales/reopen-request-form';
import { MyDayHero } from './my-day-hero';
import { PendingLink } from '@/components/shared/pending-link';


interface Props {
  ctx: UserContext;
  /** Resolved once on the page and passed down (avoids a re-load here). */
  flags: FeatureFlags | null;
}

/**
 * The ONE salesman workspace (unified flag ON), STREAMED for field speed: only
 * the day state (+ hero candidates) are awaited so the **primary next action**
 * (Resume / Next Customer / End Day) is in the first chunk (< 1 s target).
 * Everything else — customer picker, attention/copilot, KPI cards — streams later
 * behind Suspense. Field users care about the next action, not dashboard data.
 */
export async function SalesmanWorkspace({ ctx, flags }: Props) {
  const { t } = await getT();
  const smartNext = smartNextCustomerEnabled(flags);
  const startHref = smartNext ? '/field/next' : '/field/journey';

  // HERO-CRITICAL ONLY: day state (1 read) decides the layout; candidates feed the
  // SFA hero when the day is open. Nothing else blocks the first paint.
  const { state } = await loadVanDayState(ctx);

  let hero: ReactNode = null;
  if (state === 'open' && smartNext) {
    const res = await loadNextCandidates();
    const candidates = res.ok && res.data ? res.data.candidates : [];
    const planned = candidates.length;
    const visited = candidates.filter((c) => c.visited).length;
    hero = <MyDayHero candidates={candidates} visited={visited} planned={planned} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('vanSales.myDayTitle')} description={t('vanSales.workspaceSubtitle')} />

      {/* ── PRIMARY NEXT ACTION (first chunk, no competing primaries) ── */}
      {hero ?? <DayCard ctx={ctx} state={state} startHref={startHref} />}

      {/* Secondary operational actions, presented as equal tiles: Van Stock
          (Movement report when enabled) · Daily Summary · Off-route customers. */}
      <div className="grid grid-cols-2 gap-3">
        {[
          stockMovementReportEnabled(flags)
            ? { key: 'stock', href: '/field/stock/movements', icon: Boxes, label: 'vanSales.stockMove.title' }
            : { key: 'stock', href: '/field/stock', icon: Boxes, label: 'vanSales.steps.stock' },
          ...(dailySummaryEnabled(flags) ? [{ key: 'summary', href: '/field/van-sales/summary', icon: BarChart3, label: 'vanSales.dailySummary.tile' }] : []),
          { key: 'offroute', href: '/field/van-sales/customers', icon: UserSquare, label: 'vanSales.offRouteTile' },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.key} href={s.href} className="block">
              <Card className="h-full transition-colors hover:bg-secondary/50">
                <CardContent className="flex h-full flex-col items-start gap-2 pt-6">
                  <Icon className="h-6 w-6 text-primary" />
                  <span className="text-sm font-medium">{t(s.label)}</span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
      {/* Operational KPIs live in the Daily Summary ("ملخص اليوم") dashboard now —
          no duplicate KPI block on Today (one source of truth). */}
    </div>
  );
}

/** Day-status card for not-started / closed, and the open fallback when Smart
 *  Next is off. Reopen gate is fetched only when closed (off the hot path). */
async function DayCard({ ctx, state, startHref }: { ctx: UserContext; state: VanDayState; startHref: string }) {
  const { t } = await getT();
  const reopen = state === 'closed' ? await loadDayReopenGate(ctx) : null;
  const pendingReopen = reopen?.request?.status === 'pending';
  const tone = state === 'open' ? 'success' : state === 'closed' ? 'secondary' : 'outline';
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <Badge variant={tone}>{t(`vanSales.state.${state}`)}</Badge>

        {state === 'not_started' && (
          <PendingLink href={startHref} pendingLabel={t('common.starting')} className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-4 text-base font-semibold text-primary-foreground transition-[transform,opacity] duration-100 active:scale-[0.98] hover:bg-primary/90">
            <Play className="h-5 w-5 rtl:rotate-180" /> {t('vanSales.start')}
          </PendingLink>
        )}

        {state === 'open' && (
          <div className="space-y-2">
            <PendingLink href="/field/journey" pendingLabel={t('common.opening')} className={`${buttonVariants({ variant: 'outline' })} w-full`}>
              <MapPin className="h-4 w-4" /> {t('vanSales.continueRoute')}
            </PendingLink>
            <PendingLink href="/field/journey?endday=1" pendingLabel={t('common.closing')} className={`${buttonVariants({ variant: 'default' })} w-full`}>
              <CheckCircle2 className="h-4 w-4" /> {t('vanSales.endDaySettle')}
            </PendingLink>
          </div>
        )}

        {state === 'closed' && reopen && (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              {pendingReopen ? <Clock className="h-5 w-5 text-amber-600" /> : <Lock className="h-5 w-5 text-muted-foreground" />}
              <p className="font-semibold">{pendingReopen ? t('vanSales.reopen.pendingTitle') : t('vanSales.dayClosedTitle')}</p>
            </div>
            <p className="text-sm text-muted-foreground">{pendingReopen ? t('vanSales.reopen.pendingBody') : t('vanSales.dayClosedBody')}</p>
            {!pendingReopen && reopen.canRequest && reopen.sessionId && (
              <ReopenRequestForm workSessionId={reopen.sessionId} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

