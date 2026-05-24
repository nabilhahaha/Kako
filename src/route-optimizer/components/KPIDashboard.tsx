import { useTranslation } from 'react-i18next';
import { Route, Users, MapPin, TrendingUp, AlertTriangle, CheckCircle, BarChart3, Clock } from 'lucide-react';
import type { OptimizationResult } from '../types';

interface KPIDashboardProps {
  result: OptimizationResult;
}

export function KPIDashboard({ result }: KPIDashboardProps) {
  const { t } = useTranslation();
  const { kpis } = result;

  const kpiCards = [
    { label: t('kpi.totalRoutes'), value: kpis.totalRoutes, icon: Route, color: 'text-primary' },
    { label: t('kpi.distributedCustomers'), value: kpis.distributedCustomers.toLocaleString(), icon: Users, color: 'text-primary' },
    { label: t('kpi.monthlyVisits'), value: kpis.monthlyVisits.toLocaleString(), icon: MapPin, color: 'text-info' },
    { label: t('kpi.monthlyDistance'), value: `${kpis.monthlyDistance.toFixed(0)} ${t('common.km')}`, icon: TrendingUp, color: 'text-info' },
    { label: t('kpi.loadBalance'), value: `${kpis.loadBalancePercent.toFixed(1)}%`, icon: BarChart3, color: kpis.loadBalancePercent > 85 ? 'text-success' : 'text-warning' },
    { label: t('kpi.avgSellingTime'), value: `${(kpis.avgSellingTime * 100).toFixed(1)}%`, icon: Clock, color: kpis.avgSellingTime > 0.5 ? 'text-success' : 'text-warning' },
    { label: t('kpi.unassignedCustomers'), value: kpis.unassignedCount, icon: AlertTriangle, color: kpis.unassignedCount > 0 ? 'text-destructive' : 'text-success' },
    { label: t('kpi.overloadedRoutes'), value: kpis.overloadedRoutes, icon: AlertTriangle, color: kpis.overloadedRoutes > 0 ? 'text-warning' : 'text-success' },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-h2 font-semibold">{t('kpi.title')}</h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpiCards.map((kpi) => (
          <div key={kpi.label} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              <span className="text-xs text-muted-foreground">{kpi.label}</span>
            </div>
            <p className="text-xl font-bold">{kpi.value}</p>
          </div>
        ))}
      </div>

      {result.outstationRoutes.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <MapPin className="h-4 w-4 text-warning" />
            {t('kpi.outstationSection')}
          </h3>
          <p className="text-sm text-muted-foreground">
            {result.outstationRoutes.length} {t('routeCards.outstationLabel')} — {result.outstationRoutes.reduce((s, r) => s + r.totalCustomers, 0)} {t('map.customers')}
          </p>
        </div>
      )}

      {result.needsDecision.length > 0 && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            {t('kpi.needsDecisionSection')}
          </h3>
          <div className="max-h-40 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="px-2 py-1 text-start">{t('visitTable.columns.customerCode')}</th>
                  <th className="px-2 py-1 text-start">{t('visitTable.columns.customerName')}</th>
                  <th className="px-2 py-1 text-start">{t('visitTable.columns.city')}</th>
                </tr>
              </thead>
              <tbody>
                {result.needsDecision.map((c) => (
                  <tr key={c.index} className="border-b last:border-0">
                    <td className="px-2 py-1 font-mono">{c.customerNo}</td>
                    <td className="px-2 py-1">{c.customerNameE || c.customerNameA}</td>
                    <td className="px-2 py-1">{c.city}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result.unassignedCustomers.length > 0 && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            {t('kpi.unassignedCustomers')} ({result.unassignedCustomers.length})
          </h3>
          <div className="max-h-40 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="px-2 py-1 text-start">{t('visitTable.columns.customerCode')}</th>
                  <th className="px-2 py-1 text-start">{t('visitTable.columns.customerName')}</th>
                  <th className="px-2 py-1 text-start">{t('visitTable.columns.city')}</th>
                </tr>
              </thead>
              <tbody>
                {result.unassignedCustomers.map((c) => (
                  <tr key={c.index} className="border-b last:border-0">
                    <td className="px-2 py-1 font-mono">{c.customerNo}</td>
                    <td className="px-2 py-1">{c.customerNameE || c.customerNameA}</td>
                    <td className="px-2 py-1">{c.city}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {kpis.unassignedCount === 0 && kpis.overloadedRoutes === 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 p-4">
          <CheckCircle className="h-5 w-5 text-success" />
          <span className="text-sm font-medium text-success">{t('kpi.commentary.excellent')}</span>
        </div>
      )}
    </div>
  );
}
