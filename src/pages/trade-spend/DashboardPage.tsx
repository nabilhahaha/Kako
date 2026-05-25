import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart,
  Clock,
  Activity,
  BarChart3,
  FileWarning,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTradeSpendStore } from '@/stores/tradeSpendStore';
import { computeCampaignMetrics } from '@/lib/trade-spend/engine';
import type { Campaign, CampaignMetrics } from '@/lib/trade-spend/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSAR(value: number): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 0 })} SAR`;
}

function formatPct(value: number | null): string {
  if (value == null) return '--';
  return `${value.toFixed(1)}%`;
}

function valueColorClass(value: number): string {
  if (value > 0) return 'value-positive';
  if (value < 0) return 'value-negative';
  return '';
}

// ---------------------------------------------------------------------------
// Derived data types
// ---------------------------------------------------------------------------

interface CampaignWithMetrics {
  campaign: Campaign;
  metrics: CampaignMetrics;
}

interface GroupedROI {
  name: string;
  avgRoi: number;
  count: number;
}

interface AlertItem {
  type: 'expiring' | 'zeroUplift' | 'cannibalization' | 'repeatedNegative';
  campaignId?: string;
  customerAccount?: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DashboardPage() {
  const { t } = useTranslation();
  const campaigns = useTradeSpendStore((s) => s.campaigns);
  const transactions = useTradeSpendStore((s) => s.transactions);
  const latestDataDate = useTradeSpendStore((s) => s.latestDataDate);

  // Compute metrics for every campaign
  const allMetrics: CampaignWithMetrics[] = useMemo(() => {
    if (campaigns.length === 0 || transactions.length === 0) return [];
    return campaigns.map((c) => ({
      campaign: c,
      metrics: computeCampaignMetrics(c, transactions, latestDataDate),
    }));
  }, [campaigns, transactions, latestDataDate]);

  // ------ Provisional banner ------
  const hasProvisionalData = useMemo(
    () => allMetrics.some((m) => !m.metrics.data_completeness.is_complete),
    [allMetrics],
  );

  // ------ KPI aggregations ------
  const kpis = useMemo(() => {
    const totalSpend = campaigns.reduce((s, c) => s + c.spend_amount, 0);
    const roshenShare = allMetrics.reduce((s, m) => s + m.metrics.roshen_share, 0);
    const totalUplift = allMetrics.reduce((s, m) => s + m.metrics.uplift_value, 0);

    const roiValues = allMetrics
      .map((m) => m.metrics.roi_roshen)
      .filter((v): v is number => v != null);
    const avgRoiRoshen =
      roiValues.length > 0
        ? roiValues.reduce((s, v) => s + v, 0) / roiValues.length
        : null;

    const committedSpend = allMetrics
      .filter((m) => m.metrics.result_status === 'running')
      .reduce((s, m) => s + m.campaign.spend_amount, 0);

    const wins = allMetrics.filter((m) => m.metrics.result_status === 'win').length;
    const losses = allMetrics.filter((m) => m.metrics.result_status === 'loss').length;
    const running = allMetrics.filter((m) => m.metrics.result_status === 'running').length;

    return { totalSpend, roshenShare, totalUplift, avgRoiRoshen, committedSpend, wins, losses, running };
  }, [campaigns, allMetrics]);

  // ------ Alerts ------
  const alerts = useMemo(() => {
    const items: AlertItem[] = [];

    // Expiring within 7 days
    for (const m of allMetrics) {
      if (m.metrics.is_expiring) {
        items.push({
          type: 'expiring',
          campaignId: m.campaign.id,
          label: `${m.campaign.id} — ${t('dashboard.expiringSoon')}`,
        });
      }
    }

    // Zero uplift
    for (const m of allMetrics) {
      if (m.metrics.uplift_value === 0) {
        items.push({
          type: 'zeroUplift',
          campaignId: m.campaign.id,
          label: `${m.campaign.id} — ${t('dashboard.zeroUplift')}`,
        });
      }
    }

    // Cannibalization
    for (const m of allMetrics) {
      if (m.metrics.cannibalization_flag) {
        items.push({
          type: 'cannibalization',
          campaignId: m.campaign.id,
          label: `${m.campaign.id} — ${t('dashboard.cannibalization')}`,
        });
      }
    }

    // Repeated negative customer: customers with >= 2 campaigns where roi_roshen < 0
    const negByCustomer = new Map<string, string[]>();
    for (const m of allMetrics) {
      if (m.metrics.roi_roshen != null && m.metrics.roi_roshen < 0) {
        const existing = negByCustomer.get(m.campaign.account) ?? [];
        existing.push(m.campaign.id);
        negByCustomer.set(m.campaign.account, existing);
      }
    }
    for (const [account, ids] of negByCustomer) {
      if (ids.length >= 2) {
        items.push({
          type: 'repeatedNegative',
          customerAccount: account,
          label: `${account} — ${t('dashboard.repeatedNegative')} (${ids.length} campaigns)`,
        });
      }
    }

    return items;
  }, [allMetrics, t]);

  // ------ ROI by Spend Type ------
  const roiBySpendType: GroupedROI[] = useMemo(() => {
    const groups = new Map<string, number[]>();
    for (const m of allMetrics) {
      const key = m.campaign.spend_type || 'Other';
      const arr = groups.get(key) ?? [];
      if (m.metrics.roi_roshen != null) arr.push(m.metrics.roi_roshen);
      groups.set(key, arr);
    }
    return Array.from(groups.entries()).map(([name, values]) => ({
      name,
      avgRoi: values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0,
      count: values.length,
    }));
  }, [allMetrics]);

  // ------ ROI by Classification ------
  const roiByClassification: GroupedROI[] = useMemo(() => {
    const groups = new Map<string, number[]>();
    for (const m of allMetrics) {
      const key = m.campaign.classification || 'Unclassified';
      const arr = groups.get(key) ?? [];
      if (m.metrics.roi_roshen != null) arr.push(m.metrics.roi_roshen);
      groups.set(key, arr);
    }
    return Array.from(groups.entries()).map(([name, values]) => ({
      name,
      avgRoi: values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0,
      count: values.length,
    }));
  }, [allMetrics]);

  // ------ Top 5 / Bottom 5 ------
  const { top5, bottom5 } = useMemo(() => {
    const sorted = [...allMetrics]
      .filter((m) => m.metrics.roi_roshen != null)
      .sort((a, b) => (b.metrics.roi_roshen ?? 0) - (a.metrics.roi_roshen ?? 0));

    return {
      top5: sorted.slice(0, 5),
      bottom5: sorted.slice(-5).reverse(),
    };
  }, [allMetrics]);

  // ------ Edge case: no campaigns ------
  if (campaigns.length === 0) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="heading-1 font-display">{t('dashboard.title')}</h1>
        </header>
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-card px-8 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <BarChart3 className="h-7 w-7" />
          </div>
          <h2 className="heading-2 font-display text-foreground">
            No campaigns yet
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Create your first trade spend campaign to start seeing ROI analytics on this dashboard.
          </p>
        </div>
      </div>
    );
  }

  // ------ Edge case: no transactions ------
  if (transactions.length === 0) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="heading-1 font-display">{t('dashboard.title')}</h1>
        </header>
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-card px-8 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-warning/10 text-warning">
            <FileWarning className="h-7 w-7" />
          </div>
          <h2 className="heading-2 font-display text-foreground">
            No sales data uploaded
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Upload raw sales transaction data so the ROI engine can compute campaign metrics.
          </p>
        </div>
      </div>
    );
  }

  // ------ Alert icon mapping ------
  const alertIcon: Record<AlertItem['type'], typeof AlertTriangle> = {
    expiring: Clock,
    zeroUplift: Activity,
    cannibalization: TrendingDown,
    repeatedNegative: AlertTriangle,
  };

  const alertVariant: Record<AlertItem['type'], 'warning' | 'destructive' | 'info' | 'secondary'> = {
    expiring: 'warning',
    zeroUplift: 'secondary',
    cannibalization: 'destructive',
    repeatedNegative: 'destructive',
  };

  // ------ Chart tooltip ------
  const chartTooltipStyle = {
    background: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 8,
    fontSize: 12,
  };

  return (
    <div className="space-y-6">
      {/* Page title */}
      <header>
        <h1 className="heading-1 font-display">{t('dashboard.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('common.currency')} &middot; {latestDataDate}
        </p>
      </header>

      {/* Provisional banner */}
      {hasProvisionalData && (
        <div className="flex items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{t('dashboard.provisionalBanner')}</span>
          <Badge variant="warning" className="ml-auto shrink-0">
            {t('common.provisional')}
          </Badge>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* KPI Cards                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {/* Total Spend */}
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-caption uppercase tracking-wide">{t('dashboard.totalSpend')}</p>
              <p className="kpi-value tabular-nums">{formatSAR(kpis.totalSpend)}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
        </Card>

        {/* Roshen Share */}
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-caption uppercase tracking-wide">{t('dashboard.roshenShare')}</p>
              <p className="kpi-value tabular-nums">{formatSAR(kpis.roshenShare)}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10 text-info">
              <PieChart className="h-5 w-5" />
            </div>
          </div>
        </Card>

        {/* Total Uplift */}
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-caption uppercase tracking-wide">{t('dashboard.totalUplift')}</p>
              <p className={`kpi-value tabular-nums ${valueColorClass(kpis.totalUplift)}`}>
                {formatSAR(kpis.totalUplift)}
              </p>
            </div>
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                kpis.totalUplift >= 0
                  ? 'bg-success/10 text-success'
                  : 'bg-destructive/10 text-destructive'
              }`}
            >
              {kpis.totalUplift >= 0 ? (
                <TrendingUp className="h-5 w-5" />
              ) : (
                <TrendingDown className="h-5 w-5" />
              )}
            </div>
          </div>
        </Card>

        {/* Avg ROI Roshen — HIGHLIGHTED with gold accent */}
        <Card className="relative overflow-hidden border-2 border-gold p-5">
          <div className="absolute inset-x-0 top-0 h-1 bg-gold" />
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-caption uppercase tracking-wide">{t('dashboard.avgRoiRoshen')}</p>
              <p className="kpi-value gold-accent tabular-nums">
                {formatPct(kpis.avgRoiRoshen)}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold text-gold-foreground">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
        </Card>

        {/* Committed Spend */}
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-caption uppercase tracking-wide">{t('dashboard.committedSpend')}</p>
              <p className="kpi-value tabular-nums">{formatSAR(kpis.committedSpend)}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10 text-warning">
              <Clock className="h-5 w-5" />
            </div>
          </div>
        </Card>

        {/* Win / Loss / Running counts */}
        <Card className="p-5">
          <div className="space-y-1">
            <p className="text-caption uppercase tracking-wide">{t('common.status')}</p>
            <div className="mt-2 flex items-center gap-3">
              <div className="text-center">
                <p className="kpi-value value-positive tabular-nums">{kpis.wins}</p>
                <p className="text-caption">{t('dashboard.winCount')}</p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="text-center">
                <p className="kpi-value value-negative tabular-nums">{kpis.losses}</p>
                <p className="text-caption">{t('dashboard.lossCount')}</p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="text-center">
                <p className="kpi-value tabular-nums text-muted-foreground">{kpis.running}</p>
                <p className="text-caption">{t('dashboard.runningCount')}</p>
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Alerts Panel                                                       */}
      {/* ------------------------------------------------------------------ */}
      {alerts.length > 0 && (
        <section>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="heading-2 font-display flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" />
                {t('dashboard.alerts')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {alerts.map((alert, idx) => {
                  const Icon = alertIcon[alert.type];
                  return (
                    <li
                      key={`${alert.type}-${alert.campaignId ?? alert.customerAccount}-${idx}`}
                      className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 text-sm text-foreground">{alert.label}</span>
                      <Badge variant={alertVariant[alert.type]} className="shrink-0">
                        {alert.type === 'expiring' && t('status.expiring')}
                        {alert.type === 'zeroUplift' && t('dashboard.zeroUplift')}
                        {alert.type === 'cannibalization' && t('dashboard.cannibalization')}
                        {alert.type === 'repeatedNegative' && t('dashboard.repeatedNegative')}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Charts: ROI by Spend Type & ROI by Classification                  */}
      {/* ------------------------------------------------------------------ */}
      <section className="grid gap-4 lg:grid-cols-2">
        {/* ROI by Spend Type */}
        <Card className="p-5">
          <div className="space-y-1">
            <h3 className="heading-2 font-display">{t('dashboard.roiBySpendType')}</h3>
            <p className="text-caption">{t('dashboard.avgRoiRoshen')}</p>
          </div>
          <div className="mt-4 w-full" style={{ height: 300 }}>
            {roiBySpendType.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={roiBySpendType}
                  margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                  />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(value: unknown) => [`${Number(value).toFixed(1)}%`, t('dashboard.avgRoiRoshen')]}
                    cursor={{ fill: 'hsl(var(--accent) / 0.15)' }}
                  />
                  <Bar dataKey="avgRoi" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-caption">
                {t('common.noData')}
              </div>
            )}
          </div>
        </Card>

        {/* ROI by Classification */}
        <Card className="p-5">
          <div className="space-y-1">
            <h3 className="heading-2 font-display">{t('dashboard.roiByClassification')}</h3>
            <p className="text-caption">{t('dashboard.avgRoiRoshen')}</p>
          </div>
          <div className="mt-4 w-full" style={{ height: 300 }}>
            {roiByClassification.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={roiByClassification}
                  margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                  />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(value: unknown) => [`${Number(value).toFixed(1)}%`, t('dashboard.avgRoiRoshen')]}
                    cursor={{ fill: 'hsl(var(--accent) / 0.15)' }}
                  />
                  <Bar dataKey="avgRoi" fill="hsl(var(--accent))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-caption">
                {t('common.noData')}
              </div>
            )}
          </div>
        </Card>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Top 5 / Bottom 5 Tables                                            */}
      {/* ------------------------------------------------------------------ */}
      <section className="grid gap-4 lg:grid-cols-2">
        {/* Top 5 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="heading-2 font-display flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-success" />
              {t('dashboard.top5')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {top5.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-caption">
                      <th className="py-2 text-left font-medium">#</th>
                      <th className="py-2 text-left font-medium">ID</th>
                      <th className="py-2 text-left font-medium">{t('campaign.customer')}</th>
                      <th className="py-2 text-left font-medium">{t('campaign.spendType')}</th>
                      <th className="py-2 text-right font-medium">{t('dashboard.totalUplift')}</th>
                      <th className="py-2 text-right font-medium">ROI</th>
                      <th className="py-2 text-center font-medium">{t('common.status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {top5.map((m, i) => (
                      <tr key={m.campaign.id} className="hover:bg-muted/50 transition-colors">
                        <td className="py-2.5 tabular-nums text-muted-foreground">{i + 1}</td>
                        <td className="py-2.5 font-medium">{m.campaign.id}</td>
                        <td className="py-2.5">{m.campaign.account}</td>
                        <td className="py-2.5">{m.campaign.spend_type}</td>
                        <td className={`py-2.5 text-right tabular-nums ${valueColorClass(m.metrics.uplift_value)}`}>
                          {formatSAR(m.metrics.uplift_value)}
                        </td>
                        <td className={`py-2.5 text-right tabular-nums font-semibold ${valueColorClass(m.metrics.roi_roshen ?? 0)}`}>
                          {formatPct(m.metrics.roi_roshen)}
                        </td>
                        <td className="py-2.5 text-center">
                          <Badge
                            variant={
                              m.metrics.result_status === 'win'
                                ? 'success'
                                : m.metrics.result_status === 'loss'
                                  ? 'destructive'
                                  : 'warning'
                            }
                          >
                            {t(`status.${m.metrics.result_status}`)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-6 text-center text-caption">{t('common.noData')}</p>
            )}
          </CardContent>
        </Card>

        {/* Bottom 5 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="heading-2 font-display flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-destructive" />
              {t('dashboard.bottom5')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bottom5.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-caption">
                      <th className="py-2 text-left font-medium">#</th>
                      <th className="py-2 text-left font-medium">ID</th>
                      <th className="py-2 text-left font-medium">{t('campaign.customer')}</th>
                      <th className="py-2 text-left font-medium">{t('campaign.spendType')}</th>
                      <th className="py-2 text-right font-medium">{t('dashboard.totalUplift')}</th>
                      <th className="py-2 text-right font-medium">ROI</th>
                      <th className="py-2 text-center font-medium">{t('common.status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {bottom5.map((m, i) => (
                      <tr key={m.campaign.id} className="hover:bg-muted/50 transition-colors">
                        <td className="py-2.5 tabular-nums text-muted-foreground">{i + 1}</td>
                        <td className="py-2.5 font-medium">{m.campaign.id}</td>
                        <td className="py-2.5">{m.campaign.account}</td>
                        <td className="py-2.5">{m.campaign.spend_type}</td>
                        <td className={`py-2.5 text-right tabular-nums ${valueColorClass(m.metrics.uplift_value)}`}>
                          {formatSAR(m.metrics.uplift_value)}
                        </td>
                        <td className={`py-2.5 text-right tabular-nums font-semibold ${valueColorClass(m.metrics.roi_roshen ?? 0)}`}>
                          {formatPct(m.metrics.roi_roshen)}
                        </td>
                        <td className="py-2.5 text-center">
                          <Badge
                            variant={
                              m.metrics.result_status === 'win'
                                ? 'success'
                                : m.metrics.result_status === 'loss'
                                  ? 'destructive'
                                  : 'warning'
                            }
                          >
                            {t(`status.${m.metrics.result_status}`)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-6 text-center text-caption">{t('common.noData')}</p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
