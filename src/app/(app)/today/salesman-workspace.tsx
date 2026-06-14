import Link from 'next/link';
import {
  Play, CheckCircle2, Lock, Clock, MapPin, AlertTriangle, ListChecks,
  Users, ShoppingCart, HandCoins, Undo2, Boxes, ClipboardCheck, type LucideIcon,
} from 'lucide-react';
import { getT } from '@/lib/i18n/server';
import type { UserContext } from '@/lib/erp/auth-context';
import type { AttentionItem } from '@/app/(app)/copilot/actions';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard, type StatTone } from '@/components/shared/stat-card';
import { AttentionList } from '@/components/home/home-widgets';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { coverageBand } from '@/lib/erp/attention';
import { loadVanDayState, loadDayReopenGate } from '@/lib/van-sales/day-server';
import { ReopenRequestForm } from '@/app/(app)/field/van-sales/reopen-request-form';

const COVERAGE_TONE: Record<'good' | 'attention' | 'critical' | 'unknown', StatTone> =
  { good: 'success', attention: 'warning', critical: 'destructive', unknown: 'info' };

// Route-first operational tiles (the visit spine lives behind "Continue route").
const TILES: { key: string; href: string; icon: LucideIcon }[] = [
  { key: 'customer', href: '/field/van-sales/customers', icon: Users },
  { key: 'sell', href: '/field/van-sales/sell', icon: ShoppingCart },
  { key: 'collect', href: '/field/van-sales/collect', icon: HandCoins },
  { key: 'return', href: '/field/van-sales/return', icon: Undo2 },
  { key: 'stock', href: '/field/stock', icon: Boxes },
  { key: 'reconcile', href: '/field/van-reconciliation', icon: ClipboardCheck },
];

interface Props {
  ctx: UserContext;
  coveragePct: number | null;
  overdue: number;
  items: AttentionItem[];
  itemCount: number;
}

/** The ONE salesman workspace (unified flag ON): day status + single CTA,
 *  route-first entry, the operational tiles, reopen, and signals — all on /today.
 *  Composition over the EXISTING van-sales pieces; no engine/schema/transaction. */
export async function SalesmanWorkspace({ ctx, coveragePct, overdue, items, itemCount }: Props) {
  const { t } = await getT();
  const [{ state }, reopen] = await Promise.all([loadVanDayState(ctx), loadDayReopenGate(ctx)]);
  const tone = state === 'open' ? 'success' : state === 'closed' ? 'secondary' : 'outline';
  const pendingReopen = reopen.request?.status === 'pending';

  return (
    <div className="space-y-6">
      <PageHeader title={t('vanSales.myDayTitle')} description={t('vanSales.workspaceSubtitle')} />

      {/* Day status + single primary CTA (Start Day → Continue Route → End Day). */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-center justify-between gap-3">
            <Badge variant={tone}>{t(`vanSales.state.${state}`)}</Badge>
          </div>

          {state === 'not_started' && (
            <Link href="/field/journey" className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-4 text-base font-semibold text-primary-foreground hover:bg-primary/90">
              <Play className="h-5 w-5 rtl:rotate-180" /> {t('vanSales.start')}
            </Link>
          )}

          {state === 'open' && (
            <div className="space-y-2">
              <Link href="/field/journey" className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-4 text-base font-semibold text-primary-foreground hover:bg-primary/90">
                <MapPin className="h-5 w-5" /> {t('vanSales.continueRoute')}
              </Link>
              <Link href="/field/van-reconciliation" className={`${buttonVariants({ variant: 'outline' })} w-full`}>
                <CheckCircle2 className="h-4 w-4" /> {t('vanSales.endDaySettle')}
              </Link>
            </div>
          )}

          {state === 'closed' && (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center gap-2">
                {pendingReopen
                  ? <Clock className="h-5 w-5 text-amber-600" />
                  : <Lock className="h-5 w-5 text-muted-foreground" />}
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

      {/* Signals — compact, not a second screen. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('home.coverage')} value={coveragePct == null ? '—' : `${Math.round(coveragePct)}%`} icon={MapPin} tone={COVERAGE_TONE[coverageBand(coveragePct)]} />
        <StatCard label={t('home.overdue')} value={String(overdue)} icon={AlertTriangle} tone={overdue > 0 ? 'destructive' : 'success'} href="/field/van-sales/collect" />
        <StatCard label={t('home.items')} value={String(itemCount)} icon={ListChecks} tone="info" href="/attention" />
      </div>

      {/* Operational tiles — one home for every task; no module thinking. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {TILES.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.key} href={s.href} className="block">
              <Card className="h-full transition-colors hover:bg-secondary/50">
                <CardContent className="flex h-full flex-col items-start gap-2 pt-6">
                  <Icon className="h-6 w-6 text-primary" />
                  <span className="text-sm font-medium">{t(`vanSales.steps.${s.key}`)}</span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Attention-first (reused) — what needs the rep's eyes today. */}
      {items.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('home.attentionFirst')}</h2>
          <AttentionList items={items.slice(0, 6)} openLabel={t('home.open')} emptyTitle={t('home.emptyAttention')} />
        </section>
      )}
    </div>
  );
}
