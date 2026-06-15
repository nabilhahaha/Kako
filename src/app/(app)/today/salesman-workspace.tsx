import Link from 'next/link';
import {
  Play, CheckCircle2, Lock, Clock, MapPin, ListChecks, Receipt, Users,
  UserSquare, HandCoins, Boxes, type LucideIcon,
} from 'lucide-react';
import { getT } from '@/lib/i18n/server';
import type { UserContext } from '@/lib/erp/auth-context';
import type { AttentionItem } from '@/app/(app)/copilot/actions';
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
import { loadVanCustomerPicker } from '@/lib/van-sales/customers-server';
import { ReopenRequestForm } from '@/app/(app)/field/van-sales/reopen-request-form';
import { CustomerPicker } from '@/app/(app)/field/van-sales/customers/customer-picker';

// Non-visit operational quick actions (the visit steps — Collect/Sell/Return —
// happen INSIDE the customer visit context, reached from the embedded picker).
const TILES: { key: string; href: string; icon: LucideIcon; label: string }[] = [
  { key: 'stock', href: '/field/stock', icon: Boxes, label: 'vanSales.steps.stock' },
];

interface Props {
  ctx: UserContext;
  items: AttentionItem[];
  itemCount: number;
}

/** The ONE salesman workspace (unified flag ON): customer-driven. Day status +
 *  a Customer-first CTA (route stays the spine), the operational tiles in visit
 *  order, the reopen flow, and a real-time operational KPI strip. Composition
 *  over existing pieces; no engine/schema/transaction change. */
export async function SalesmanWorkspace({ ctx, items, itemCount }: Props) {
  const { t, locale } = await getT();
  const intl = INTL_LOCALE[locale];
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ state }, reopen, planRes, visRes, invRes, colRes, picker] = await Promise.all([
    loadVanDayState(ctx),
    loadDayReopenGate(ctx),
    supabase.rpc('erp_today_journey', { p_salesman: ctx.userId, p_date: today }),
    supabase.from('erp_visits').select('customer_id').eq('salesman_id', ctx.userId).eq('visit_date', today),
    supabase.from('erp_invoices').select('net_amount, status').eq('created_by', ctx.userId).gte('created_at', `${today}T00:00:00`),
    supabase.from('erp_collections').select('amount, status').eq('received_by', ctx.userId).eq('collection_date', today),
    loadVanCustomerPicker(ctx),
  ]);

  // Operational KPIs (read-only; reuse existing data — no new engine).
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

  const tone = state === 'open' ? 'success' : state === 'closed' ? 'secondary' : 'outline';
  const pendingReopen = reopen.request?.status === 'pending';

  return (
    <div className="space-y-6">
      <PageHeader title={t('vanSales.myDayTitle')} description={t('vanSales.workspaceSubtitle')} />

      {/* Day status + Customer-first CTA (route stays the spine, as secondary). */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <Badge variant={tone}>{t(`vanSales.state.${state}`)}</Badge>

          {state === 'not_started' && (
            <Link href="/field/journey" className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-4 text-base font-semibold text-primary-foreground hover:bg-primary/90">
              <Play className="h-5 w-5 rtl:rotate-180" /> {t('vanSales.start')}
            </Link>
          )}

          {state === 'open' && (
            <div className="space-y-2">
              <Link href="/field/journey" className={`${buttonVariants({ variant: 'outline' })} w-full`}>
                <MapPin className="h-4 w-4" /> {t('vanSales.continueRoute')}
              </Link>
              {/* End Day opens the close-day workflow directly (not a dead-end). */}
              <Link href="/field/journey?endday=1" className={`${buttonVariants({ variant: 'default' })} w-full`}>
                <CheckCircle2 className="h-4 w-4" /> {t('vanSales.endDaySettle')}
              </Link>
            </div>
          )}

          {state === 'closed' && (
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

      {/* Operational KPIs — planned / visited / remaining + sales / collections / compliance. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label={t('vanSales.kpi.planned')} value={String(planned)} icon={Users} tone="info" />
        <StatCard label={t('vanSales.kpi.visited')} value={String(visited)} icon={CheckCircle2} tone="success" />
        <StatCard label={t('vanSales.kpi.remaining')} value={String(remaining)} icon={Clock} tone={remaining > 0 ? 'warning' : 'success'} />
        <StatCard label={t('vanSales.kpi.sales')} value={formatCurrency(sales, 'EGP', intl)} icon={Receipt} tone="info" />
        <StatCard label={t('vanSales.kpi.collections')} value={formatCurrency(collections, 'EGP', intl)} icon={HandCoins} tone="success" />
        <StatCard label={t('vanSales.kpi.compliance')} value={`${compliance}%`} icon={MapPin} tone={complianceTone} />
      </div>

      {/* Customer Picker — embedded, the primary operational entry (the visit
          starts here). Today JP / All Customers, Sold-today, Sell-again warning,
          off-route flow all live in the picker. Shown once the day is open. */}
      {state === 'open' && picker && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <UserSquare className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('vanSales.steps.customer')}</h2>
          </div>
          <CustomerPicker customers={picker.customers} />
        </section>
      )}

      {/* Non-visit quick actions: Van Stock · End Day & Settle. */}
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

      {/* Attention-first (reused) — what needs the rep's eyes today. */}
      {items.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('home.attentionFirst')} · {itemCount}</h2>
          </div>
          <AttentionList items={items.slice(0, 6)} openLabel={t('home.open')} emptyTitle={t('home.emptyAttention')} />
        </section>
      )}
    </div>
  );
}
