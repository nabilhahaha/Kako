import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Award, Database, FileText, Gift, Megaphone, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { KPICard } from '@/components/shared/KPICard';
import { EmptyState } from '@/components/shared/EmptyState';
import {
  initPromotionsRuntime,
  subscribePromotions,
  getPromotionsVersion,
  getCampaigns,
  getBuilderPromos,
  getPoolInfo,
  getPortfolioTotals,
  isRepIncentive,
  simulatePromo,
  type BuilderPromo,
  type CampaignView,
} from '@/lib/promotions/runtime';
import { Fmt } from '@/lib/promotions/frozen/calc-engine.js';

const HEALTH_CLASS: Record<CampaignView['health'], string> = {
  healthy: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  critical: 'bg-destructive/10 text-destructive',
  attention: 'bg-info/10 text-info',
  neutral: 'bg-muted text-muted-foreground',
};

const STATUS_CLASS: Record<BuilderPromo['status'], string> = {
  active: 'bg-success/10 text-success',
  draft: 'bg-muted text-muted-foreground',
  paused: 'bg-warning/10 text-warning',
};

function money(n: number | null | undefined): string {
  return n == null ? '—' : (Fmt.money0(n) as string);
}

function CampaignCard({ c }: { c: CampaignView }) {
  const { t } = useTranslation();
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-foreground">{c.displayName}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {c.startDate} · {c.mechanic}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${HEALTH_CLASS[c.health]}`}>
            {t(`promotions.health.${c.health}`)}
          </span>
          <span className="rounded bg-primary/8 px-1.5 py-0.5 text-[9px] font-medium text-primary">
            {c.isAudited ? t('promotions.badgeAudited') : t('promotions.badgePublished')}
          </span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
        <span className="text-muted-foreground">{t('promotions.compensation')}</span>
        <span className="text-end font-semibold tabular-nums text-foreground">{money(c.compensation)}</span>
        <span className="text-muted-foreground">{t('promotions.inclVat')}</span>
        <span className="text-end tabular-nums text-foreground">{money(c.compensationInclVat)}</span>
        <span className="text-muted-foreground">{t('promotions.freeValue')}</span>
        <span className="text-end tabular-nums text-foreground">{money(c.freeValue)}</span>
        <span className="text-muted-foreground">{t('promotions.rate')}</span>
        <span className="text-end tabular-nums text-foreground">{Math.round(c.rate * 100)}%</span>
        <span className="text-muted-foreground">{t('promotions.recipients')}</span>
        <span className="text-end tabular-nums text-foreground">
          {Fmt.n0(c.recipients)} · {Fmt.n0(c.invoiceCount)} {t('promotions.invoices')}
        </span>
      </div>
    </Card>
  );
}

function reward7Summary(t: (k: string, o?: Record<string, unknown>) => string, p: BuilderPromo): string {
  const unit = t(p.buyUnit === 'pcs' ? 'promotions.unitPcs' : 'promotions.unitCases');
  const buy = `${p.buyQty ?? '—'} ${unit}`;
  switch (p.rewardType) {
    case 'free_product':
      return t('promotions.rewardFree', { buy, qty: p.reward.rewardQty ?? '—' });
    case 'discount_pct':
      return t('promotions.rewardDiscount', { buy, pct: p.reward.discountPct ?? '—' });
    default:
      return t('promotions.rewardCash', { buy, amount: p.reward.rewardAmount ?? '—' });
  }
}

function BuilderPromoCard({ p }: { p: BuilderPromo }) {
  const { t } = useTranslation();
  const sim = useMemo(() => simulatePromo(p), [p]);
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-foreground">
            {p.name || t('promotions.unnamed')}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {p.startDate || '—'} → {p.endDate || '—'}
          </p>
        </div>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${STATUS_CLASS[p.status]}`}>
          {t(`promotions.status.${p.status}`)}
        </span>
      </div>
      <p className="mt-2 text-[12px] text-foreground">{reward7Summary(t, p)}</p>
      <p className="text-[11px] text-muted-foreground">
        {p.productCodes.length} {t('promotions.skus')} ·{' '}
        {p.customerScope === 'selected'
          ? `${p.customerCodes.length} ${t('promotions.customersSelected')}`
          : t('promotions.customersAll')}
      </p>
      {sim && (
        <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-2 text-center">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('promotions.simQualifying')}</p>
            <p className="text-[13px] font-semibold tabular-nums">{Fmt.n0(sim.qualifying)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('promotions.simConditions')}</p>
            <p className="text-[13px] font-semibold tabular-nums">{Fmt.n0(sim.achievements)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('promotions.simCost')}</p>
            <p className="text-[13px] font-semibold tabular-nums">{money(sim.cost)}</p>
          </div>
        </div>
      )}
    </Card>
  );
}

function RepProgramCard({ p }: { p: BuilderPromo }) {
  const { t } = useTranslation();
  const sim = useMemo(() => simulatePromo(p), [p]);
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-foreground">
            {p.name || t('promotions.unnamed')}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {p.startDate || '—'} → {p.endDate || '—'}
          </p>
        </div>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${STATUS_CLASS[p.status]}`}>
          {t(`promotions.status.${p.status}`)}
        </span>
      </div>
      <p className="mt-2 text-[12px] text-foreground">
        {t('promotions.repRule', {
          min: p.repIncentive?.minCustomers ?? 0,
          amount: p.reward.rewardAmount ?? 0,
        })}
      </p>
      {sim && (
        <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-2 text-center">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('promotions.repAchieved')}</p>
            <p className="text-[13px] font-semibold tabular-nums">
              {Fmt.n0(sim.repsAchieved ?? 0)} / {Fmt.n0(sim.repsTotal ?? 0)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('promotions.simQualifying')}</p>
            <p className="text-[13px] font-semibold tabular-nums">{Fmt.n0(sim.qualifying)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('promotions.repPayout')}</p>
            <p className="text-[13px] font-semibold tabular-nums">{money(sim.cost)}</p>
          </div>
        </div>
      )}
    </Card>
  );
}

export function PromotionsPage() {
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  const version = useSyncExternalStore(subscribePromotions, getPromotionsVersion);

  useEffect(() => {
    let alive = true;
    initPromotionsRuntime().then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const data = useMemo(() => {
    if (!ready) return null;
    const campaigns = getCampaigns().filter((c) => !c.isHidden);
    const promos = getBuilderPromos();
    return {
      campaigns,
      repPrograms: promos.filter(isRepIncentive),
      builderPromos: promos.filter((p) => !isRepIncentive(p)),
      pool: getPoolInfo(),
      totals: getPortfolioTotals(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, version]);

  if (!data) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <div className="h-8 w-56 animate-pulse rounded-md bg-muted" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div>
        <h1 className="text-h2 text-foreground">{t('promotions.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('promotions.subtitle')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard
          label={t('promotions.kpiCampaigns')}
          value={Fmt.n0(data.totals.campaigns) as string}
          icon={Megaphone}
        />
        <KPICard
          label={t('promotions.kpiCompensation')}
          value={money(data.totals.compensation)}
          hint={t('promotions.kpiInclVat', { v: money(data.totals.compensationInclVat) })}
          icon={Award}
          tone="info"
        />
        <KPICard
          label={t('promotions.kpiRecipients')}
          value={Fmt.n0(data.totals.recipients) as string}
          hint={`${Fmt.n0(data.totals.invoices)} ${t('promotions.invoices')}`}
          icon={Users}
        />
        <KPICard
          label={t('promotions.kpiPool')}
          value={Fmt.n0(data.pool.batches.length) as string}
          hint={t(`promotions.poolMode.${data.pool.mode}`)}
          icon={Database}
          tone={data.pool.mode === 'memory' ? 'warning' : 'default'}
        />
      </div>

      <section>
        <h2 className="mb-3 text-h3 text-foreground">{t('promotions.sectionCampaigns')}</h2>
        {data.campaigns.length === 0 ? (
          <EmptyState icon={FileText} title={t('promotions.emptyCampaigns')} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.campaigns.map((c) => (
              <CampaignCard key={c.id} c={c} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-h3 text-foreground">{t('promotions.sectionRepPrograms')}</h2>
        {data.repPrograms.length === 0 ? (
          <EmptyState icon={Users} title={t('promotions.emptyRepPrograms')} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.repPrograms.map((p) => (
              <RepProgramCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-h3 text-foreground">{t('promotions.sectionConfigured')}</h2>
        {data.builderPromos.length === 0 ? (
          <EmptyState icon={Gift} title={t('promotions.emptyConfigured')} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.builderPromos.map((p) => (
              <BuilderPromoCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default PromotionsPage;
