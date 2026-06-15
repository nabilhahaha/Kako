import { Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Play, CheckCircle2, Lock, Clock, MapPin, ListChecks, Receipt, Users,
  UserSquare, HandCoins, Boxes, type LucideIcon,
} from 'lucide-react';
import { getT } from '@/lib/i18n/server';
import type { UserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { formatCurrency } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard, type StatTone } from '@/components/shared/stat-card';
import { AttentionList } from '@/components/home/home-widgets';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { loadVanDayState, loadDayReopenGate } from '@/lib/van-sales/day-server';
import type { VanDayState } from '@/lib/van-sales/day';
import { loadVanCustomerPicker } from '@/lib/van-sales/customers-server';
import { loadNextCandidates } from '@/lib/van-sales/next-customer-server';
import type { FeatureFlags } from '@/lib/erp/feature-flags';
import { smartNextCustomerEnabled } from '@/lib/van-sales/sell';
import { nextBestActions } from '@/app/(app)/copilot/actions';
import { rankAttention, summarizeAttention } from '@/lib/erp/attention';
import { ReopenRequestForm } from '@/app/(app)/field/van-sales/reopen-request-form';
import { CustomerPicker } from '@/app/(app)/field/van-sales/customers/customer-picker';
import { MyDayHero } from './my-day-hero';

const TILES: { key: string; href: string; icon: LucideIcon; label: string }[] = [
  { key: 'stock', href: '/field/stock', icon: Boxes, label: 'vanSales.steps.stock' },
];

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

      {/* Customer Picker — deferred (heavy list). */}
      {state === 'open' && (
        <Suspense fallback={<SectionSkeleton lines={4} />}>
          <PickerSection ctx={ctx} />
        </Suspense>
      )}

      {/* Non-visit quick action: Van Stock (static, immediate). */}
      <div className="grid grid-cols-2 gap-3">
        {TILES.map((s) => {
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

      {/* Attention / copilot — deferred (recommendation scan). */}
      <Suspense fallback={null}>
        <AttentionSection />
      </Suspense>

      {/* Operational KPIs — deferred, secondary, at the bottom. */}
      <Suspense fallback={<KpiSkeleton />}>
        <KpiSection ctx={ctx} />
      </Suspense>
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
          <Link href={startHref} className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-4 text-base font-semibold text-primary-foreground hover:bg-primary/90">
            <Play className="h-5 w-5 rtl:rotate-180" /> {t('vanSales.start')}
          </Link>
        )}

        {state === 'open' && (
          <div className="space-y-2">
            <Link href="/field/journey" className={`${buttonVariants({ variant: 'outline' })} w-full`}>
              <MapPin className="h-4 w-4" /> {t('vanSales.continueRoute')}
            </Link>
            <Link href="/field/journey?endday=1" className={`${buttonVariants({ variant: 'default' })} w-full`}>
              <CheckCircle2 className="h-4 w-4" /> {t('vanSales.endDaySettle')}
            </Link>
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

/** Embedded customer picker — deferred. */
async function PickerSection({ ctx }: { ctx: UserContext }) {
  const { t } = await getT();
  const picker = await loadVanCustomerPicker(ctx);
  if (!picker) return null;
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <UserSquare className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('vanSales.steps.customer')}</h2>
      </div>
      <CustomerPicker customers={picker.customers} />
    </section>
  );
}

/** Attention / copilot recommendations — deferred. */
async function AttentionSection() {
  const { t, locale } = await getT();
  const res = await nextBestActions(locale);
  const items = rankAttention(res.ok && res.data ? res.data : []);
  if (items.length === 0) return null;
  const { itemCount } = summarizeAttention(items);
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('home.attentionFirst')} · {itemCount}</h2>
      </div>
      <AttentionList items={items.slice(0, 6)} openLabel={t('home.open')} emptyTitle={t('home.emptyAttention')} />
    </section>
  );
}

/** Operational KPIs — deferred, secondary, at the bottom. */
async function KpiSection({ ctx }: { ctx: UserContext }) {
  const { t, locale } = await getT();
  const intl = INTL_LOCALE[locale];
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [planRes, visRes, invRes, colRes] = await Promise.all([
    supabase.rpc('erp_today_journey', { p_salesman: ctx.userId, p_date: today }),
    supabase.from('erp_visits').select('customer_id').eq('salesman_id', ctx.userId).eq('visit_date', today),
    supabase.from('erp_invoices').select('net_amount, status').eq('created_by', ctx.userId).gte('created_at', `${today}T00:00:00`),
    supabase.from('erp_collections').select('amount, status').eq('received_by', ctx.userId).eq('collection_date', today),
  ]);
  const planned = ((planRes.data ?? []) as unknown[]).length;
  const visited = new Set(((visRes.data ?? []) as { customer_id: string }[]).map((r) => r.customer_id)).size;
  const remaining = Math.max(planned - visited, 0);
  const compliance = planned > 0 ? Math.round((visited / planned) * 100) : 100;
  const sales = ((invRes.data ?? []) as { net_amount: number; status: string }[])
    .filter((r) => !['draft', 'void', 'cancelled'].includes(r.status))
    .reduce((s, r) => s + Number(r.net_amount ?? 0), 0);
  const collections = ((colRes.data ?? []) as { amount: number; status: string }[])
    .filter((r) => r.status !== 'cancelled')
    .reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const complianceTone: StatTone = compliance >= 90 ? 'success' : compliance >= 60 ? 'warning' : 'destructive';
  return (
    <section className="space-y-2 pt-2">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('vanSales.myDayTitle')}</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatCard label={t('vanSales.kpi.planned')} value={String(planned)} icon={Users} tone="info" />
        <StatCard label={t('vanSales.kpi.visited')} value={String(visited)} icon={CheckCircle2} tone="success" />
        <StatCard label={t('vanSales.kpi.remaining')} value={String(remaining)} icon={Clock} tone={remaining > 0 ? 'warning' : 'success'} />
        <StatCard label={t('vanSales.kpi.sales')} value={formatCurrency(sales, 'EGP', intl)} icon={Receipt} tone="info" />
        <StatCard label={t('vanSales.kpi.collections')} value={formatCurrency(collections, 'EGP', intl)} icon={HandCoins} tone="success" />
        <StatCard label={t('vanSales.kpi.compliance')} value={`${compliance}%`} icon={MapPin} tone={complianceTone} />
      </div>
    </section>
  );
}

function SectionSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg border bg-secondary/30" />
      ))}
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 pt-2 sm:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-lg border bg-secondary/30" />
      ))}
    </div>
  );
}
