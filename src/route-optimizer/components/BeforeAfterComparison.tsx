import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingDown, BarChart3, Users, Route } from 'lucide-react';
import type { Customer, OptimizationResult } from '../types';
import { totalPathDistance } from '../algorithms/haversine';

interface BeforeAfterComparisonProps {
  customers: Customer[];
  result: OptimizationResult;
}

interface DistributionStats {
  groupCount: number;
  min: number;
  max: number;
  avg: number;
  totalMonthlyKm: number;
  avgSellingTimeRatio?: number;
}

function computeMinMaxAvg(counts: number[]): { min: number; max: number; avg: number } {
  if (counts.length === 0) return { min: 0, max: 0, avg: 0 };
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const avg = counts.reduce((s, v) => s + v, 0) / counts.length;
  return { min, max, avg };
}

function computeLoadBalancePercent(counts: number[]): number {
  if (counts.length === 0) return 0;
  const avg = counts.reduce((s, v) => s + v, 0) / counts.length;
  if (avg === 0) return 0;
  const maxDeviation = Math.max(...counts.map((c) => Math.abs(c - avg)));
  return Math.max(0, (1 - maxDeviation / avg) * 100);
}

export function BeforeAfterComparison({ customers, result }: BeforeAfterComparisonProps) {
  const { t } = useTranslation();

  const beforeStats = useMemo((): DistributionStats => {
    // Group customers by their original salesmanName
    const groups = new Map<string, Customer[]>();
    for (const c of customers) {
      const name = c.salesmanName || '';
      if (!name) continue;
      const list = groups.get(name) || [];
      list.push(c);
      groups.set(name, list);
    }

    const groupCount = groups.size;
    const counts = Array.from(groups.values()).map((g) => g.length);
    const { min, max, avg } = computeMinMaxAvg(counts);

    // Estimate monthly KM: sum of haversine distances between consecutive customers per salesman
    // Multiply weekly distance by 4 for monthly estimate
    let totalMonthlyKm = 0;
    for (const group of groups.values()) {
      // Sort customers within group by lat/lng for a rough path estimate
      const sorted = [...group].sort((a, b) => a.lat - b.lat || a.lng - b.lng);
      const weeklyKm = totalPathDistance(sorted);
      totalMonthlyKm += weeklyKm * 4;
    }

    return { groupCount, min, max, avg, totalMonthlyKm };
  }, [customers]);

  const afterStats = useMemo((): DistributionStats => {
    const routes = result.routes;
    const groupCount = routes.length;
    const counts = routes.map((r) => r.totalCustomers);
    const { min, max, avg } = computeMinMaxAvg(counts);
    const totalMonthlyKm = routes.reduce((s, r) => s + r.monthlyKm, 0);
    const avgSellingTimeRatio =
      routes.length > 0
        ? routes.reduce((s, r) => s + r.sellingTimeRatio, 0) / routes.length
        : 0;

    return { groupCount, min, max, avg, totalMonthlyKm, avgSellingTimeRatio };
  }, [result]);

  const distanceSavingsPercent = useMemo(() => {
    if (beforeStats.totalMonthlyKm === 0) return 0;
    return ((beforeStats.totalMonthlyKm - afterStats.totalMonthlyKm) / beforeStats.totalMonthlyKm) * 100;
  }, [beforeStats.totalMonthlyKm, afterStats.totalMonthlyKm]);

  const beforeCounts = useMemo(() => {
    const groups = new Map<string, Customer[]>();
    for (const c of customers) {
      const name = c.salesmanName || '';
      if (!name) continue;
      const list = groups.get(name) || [];
      list.push(c);
      groups.set(name, list);
    }
    return Array.from(groups.values()).map((g) => g.length);
  }, [customers]);

  const afterCounts = useMemo(() => {
    return result.routes.map((r) => r.totalCustomers);
  }, [result]);

  const beforeBalance = useMemo(() => computeLoadBalancePercent(beforeCounts), [beforeCounts]);
  const afterBalance = useMemo(() => computeLoadBalancePercent(afterCounts), [afterCounts]);
  const balanceImprovement = afterBalance - beforeBalance;

  return (
    <div className="space-y-4">
      <h2 className="text-h2 font-semibold">{t('comparison.title')}</h2>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Before card */}
        <div className="rounded-xl border border-muted bg-card p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-muted-foreground">
            <Users className="h-5 w-5" />
            {t('comparison.before')}
          </h3>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('comparison.salesmenCount')}</span>
              <span className="text-lg font-bold">{beforeStats.groupCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('comparison.customersPerGroup')}</span>
              <span className="text-sm font-medium">
                {beforeStats.min} / {beforeStats.max} / {beforeStats.avg.toFixed(1)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('comparison.loadBalance')}</span>
              <span className="text-sm font-medium">{beforeBalance.toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('comparison.estMonthlyKm')}</span>
              <span className="text-sm font-medium">
                {beforeStats.totalMonthlyKm.toFixed(0)} {t('common.km')}
              </span>
            </div>
          </div>
        </div>

        {/* After card */}
        <div className="rounded-xl border border-primary/30 bg-card p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-primary">
            <Route className="h-5 w-5" />
            {t('comparison.after')}
          </h3>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('comparison.routesCount')}</span>
              <span className="text-lg font-bold">{afterStats.groupCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('comparison.customersPerRoute')}</span>
              <span className="text-sm font-medium">
                {afterStats.min} / {afterStats.max} / {afterStats.avg.toFixed(1)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('comparison.loadBalance')}</span>
              <span className="text-sm font-medium">{afterBalance.toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('comparison.totalMonthlyKm')}</span>
              <span className="text-sm font-medium">
                {afterStats.totalMonthlyKm.toFixed(0)} {t('common.km')}
              </span>
            </div>
            {afterStats.avgSellingTimeRatio !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('comparison.avgSellingTime')}</span>
                <span className="text-sm font-medium">
                  {(afterStats.avgSellingTimeRatio * 100).toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Comparison metrics */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Distance savings */}
        <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${distanceSavingsPercent > 0 ? 'bg-success/10' : 'bg-warning/10'}`}>
            <TrendingDown className={`h-5 w-5 ${distanceSavingsPercent > 0 ? 'text-success' : 'text-warning'}`} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('comparison.distanceSavings')}</p>
            <p className={`text-lg font-bold ${distanceSavingsPercent > 0 ? 'text-success' : 'text-warning'}`}>
              {distanceSavingsPercent > 0 ? '-' : '+'}{Math.abs(distanceSavingsPercent).toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Balance improvement */}
        <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${balanceImprovement >= 0 ? 'bg-success/10' : 'bg-warning/10'}`}>
            <BarChart3 className={`h-5 w-5 ${balanceImprovement >= 0 ? 'text-success' : 'text-warning'}`} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('comparison.betterBalance')}</p>
            <p className={`text-lg font-bold ${balanceImprovement >= 0 ? 'text-success' : 'text-warning'}`}>
              {balanceImprovement >= 0 ? '+' : ''}{balanceImprovement.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      {/* Min / Max / Avg legend */}
      <p className="text-xs text-muted-foreground">
        {t('comparison.minMaxAvgHint')}
      </p>
    </div>
  );
}
