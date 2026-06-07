import { notFound, redirect } from 'next/navigation';
import { Wallet, Receipt, Scale, Gauge, Megaphone } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import { TRADE_SPEND_ENABLED } from '@/lib/trade-spend/flags';
import { summarizeTradeSpend, type PromoSummaryRow } from '@/lib/trade-spend/summary';

/**
 * Trade Spend dashboard — rolls promotions + accruals + claims into headline KPIs
 * (accrued / claimed / open liability / cap utilisation) via the pure summary
 * read-model. INERT by default: gated by TRADE_SPEND_ENABLED() (notFound when
 * KAKO_TRADE_SPEND off) on top of the distribution module guard. Company-RLS scoped.
 */
export default async function TradeSpendDashboard() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!TRADE_SPEND_ENABLED()) notFound();
  if (!hasPermission(ctx, 'reports.view')) redirect('/dashboard');

  const { t } = await getT();
  const supabase = await createClient();

  const { data: promos } = await supabase
    .from('erp_trade_promotions').select('id, status, cap');
  const promoRows = (promos ?? []) as Array<{ id: string; status: string; cap: number | null }>;

  // Aggregate accruals + claim allocations per promotion (RLS-scoped).
  const accruedByPromo = new Map<string, number>();
  const claimedByPromo = new Map<string, number>();
  if (promoRows.length > 0) {
    const ids = promoRows.map((p) => p.id);
    const [{ data: accruals }, { data: allocs }] = await Promise.all([
      supabase.from('erp_trade_accruals').select('promotion_id, accrued_amount').in('promotion_id', ids),
      supabase.from('erp_trade_claim_allocations').select('promotion_id, applied_amount').in('promotion_id', ids),
    ]);
    for (const a of (accruals ?? []) as Array<{ promotion_id: string; accrued_amount: number }>) {
      accruedByPromo.set(a.promotion_id, (accruedByPromo.get(a.promotion_id) ?? 0) + Number(a.accrued_amount));
    }
    for (const a of (allocs ?? []) as Array<{ promotion_id: string; applied_amount: number }>) {
      claimedByPromo.set(a.promotion_id, (claimedByPromo.get(a.promotion_id) ?? 0) + Number(a.applied_amount));
    }
  }

  const rows: PromoSummaryRow[] = promoRows.map((p) => ({
    status: p.status,
    accrued: accruedByPromo.get(p.id) ?? 0,
    claimed: claimedByPromo.get(p.id) ?? 0,
    cap: p.cap != null ? Number(p.cap) : null,
  }));
  const s = summarizeTradeSpend(rows);

  return (
    <div className="space-y-6">
      <PageHeader title={t('distribution.tsTitle')} description={t('distribution.tsDescription')} />
      {rows.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t('distribution.tsEmpty')}</CardContent></Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard label={t('distribution.tsAccrued')} value={s.totalAccrued.toLocaleString()} icon={Wallet} tone="info" />
          <StatCard label={t('distribution.tsClaimed')} value={s.totalClaimed.toLocaleString()} icon={Receipt} tone="primary" />
          <StatCard label={t('distribution.tsOpenLiability')} value={s.openLiability.toLocaleString()} icon={Scale} tone={s.openLiability > 0 ? 'warning' : 'success'} />
          <StatCard label={t('distribution.tsCapUtil')} value={`${s.capUtilizationPct}%`} icon={Gauge} tone={s.capUtilizationPct >= 90 ? 'destructive' : s.capUtilizationPct >= 70 ? 'warning' : 'success'} />
          <StatCard label={t('distribution.tsActivePromos')} value={String(s.active)} icon={Megaphone} tone="info" hint={`${s.promotions}`} />
        </div>
      )}
    </div>
  );
}
