import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  BarChart3,
  FileWarning,
  Users,
  ShoppingBag,
  Layers,
  Building2,
  Activity,
  Zap,
  Crown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTradeSpendStore } from '@/stores/tradeSpendStore';
import { computeCampaignMetrics } from '@/lib/trade-spend/engine';
import type { Campaign, CampaignMetrics, CampaignStatus, WorkflowEvent, TradeSpendUser } from '@/lib/trade-spend/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSAR(value: number): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 0 })} SAR`;
}

function valueColorClass(value: number): string {
  if (value > 0) return 'value-positive';
  if (value < 0) return 'value-negative';
  return '';
}

// ---------------------------------------------------------------------------
// Status badge configuration
// ---------------------------------------------------------------------------

const STATUS_BADGE_VARIANT: Record<CampaignStatus, 'secondary' | 'warning' | 'info' | 'success' | 'destructive'> = {
  draft: 'secondary',
  pending_distributor: 'warning',
  pending_roshen: 'info',
  approved_pending_photos: 'info',
  photos_submitted: 'info',
  final_approved: 'success',
  changes_requested: 'destructive',
  rejected: 'destructive',
};

// ---------------------------------------------------------------------------
// Derived data types
// ---------------------------------------------------------------------------

interface CampaignWithMetrics {
  campaign: Campaign;
  metrics: CampaignMetrics;
}

interface AlertItem {
  type: 'expiring';
  campaignId?: string;
  customerAccount?: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Simple Customer Card data
// ---------------------------------------------------------------------------

interface CustomerCardData {
  account: string;
  name: string;
  classification?: string;
  itemNames: string[];
  salesBefore: number;
  salesAfter: number;
  campaignCount: number;
  campaignStatuses: CampaignStatus[];
}

// ---------------------------------------------------------------------------
// Simple Dashboard View
// ---------------------------------------------------------------------------

function SimpleDashboardView({
  customerCards,
  totalCampaigns,
  totalCustomers,
  t,
}: {
  customerCards: CustomerCardData[];
  totalCampaigns: number;
  totalCustomers: number;
  t: (key: string) => string;
}) {
  return (
    <div className="space-y-8">
      {/* Header */}
      <header>
        <h1 className="heading-1 font-display">
          {t('dashboard.simpleTitle')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('dashboard.simpleSubtitle')}
        </p>
      </header>

      {/* Summary stats row */}
      <section className="grid gap-4 sm:grid-cols-2">
        <Card className="relative overflow-hidden rounded-xl border shadow-sm p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-medium">
                {t('dashboard.totalCampaignsCount')}
              </p>
              <p className="text-3xl font-bold tabular-nums tracking-tight">
                {totalCampaigns}
              </p>
            </div>
          </div>
        </Card>

        <Card className="relative overflow-hidden rounded-xl border shadow-sm p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-medium">
                {t('dashboard.totalCustomersCount')}
              </p>
              <p className="text-3xl font-bold tabular-nums tracking-tight">
                {totalCustomers}
              </p>
            </div>
          </div>
        </Card>
      </section>

      {/* Customer cards grid */}
      {customerCards.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-card px-8 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <ShoppingBag className="h-7 w-7" />
          </div>
          <h2 className="heading-2 font-display text-foreground">
            {t('common.noData')}
          </h2>
        </div>
      ) : (
        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {customerCards.map((card) => {
            const salesDelta = card.salesAfter - card.salesBefore;
            const isPositive = salesDelta >= 0;

            return (
              <Card
                key={card.account}
                className="group relative overflow-hidden rounded-xl border shadow-sm transition-all duration-200 hover:shadow-md"
              >
                <CardContent className="p-5 space-y-4">
                  {/* Top: Customer name + campaign count */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold font-display leading-tight truncate">
                        {card.name}
                      </h3>
                      {card.classification && (
                        <Badge variant="secondary" className="mt-1.5 text-xs">
                          {card.classification}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground shrink-0">
                      <Layers className="h-3.5 w-3.5" />
                      {card.campaignCount}
                    </div>
                  </div>

                  {/* Items as badges */}
                  {card.itemNames.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        {t('campaign.selectedItems')}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {card.itemNames.slice(0, 6).map((name, i) => (
                          <Badge
                            key={i}
                            variant="outline"
                            className="text-[11px] font-normal"
                          >
                            {name}
                          </Badge>
                        ))}
                        {card.itemNames.length > 6 && (
                          <Badge variant="outline" className="text-[11px] font-normal">
                            +{card.itemNames.length - 6}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Sales Before / After */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {t('dashboard.salesBefore')}
                      </span>
                      <span className="font-semibold tabular-nums">
                        {formatSAR(card.salesBefore)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {t('dashboard.salesAfter')}
                      </span>
                      <span
                        className={`font-semibold tabular-nums ${
                          isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {formatSAR(card.salesAfter)}
                      </span>
                    </div>
                  </div>

                  {/* Campaign statuses */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {t('common.status')}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {card.campaignStatuses.map((status, i) => (
                        <Badge
                          key={i}
                          variant={STATUS_BADGE_VARIANT[status]}
                          className="text-[11px]"
                        >
                          {t(`status.${status}`)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>

                {/* Bottom accent bar based on sales delta */}
                <div
                  className={`h-1 w-full transition-colors ${
                    isPositive
                      ? 'bg-emerald-500/60'
                      : 'bg-red-500/60'
                  }`}
                />
              </Card>
            );
          })}
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full Dashboard View (admin / roshen_approver)
// ---------------------------------------------------------------------------

function FullDashboardView({
  allMetrics,
  campaigns,
  latestDataDate,
  t,
}: {
  allMetrics: CampaignWithMetrics[];
  campaigns: Campaign[];
  latestDataDate: string;
  t: (key: string) => string;
}) {
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

    return { totalSpend, roshenShare, totalUplift };
  }, [campaigns, allMetrics]);

  // ------ Alerts (expiring only) ------
  const alerts = useMemo(() => {
    const items: AlertItem[] = [];

    for (const m of allMetrics) {
      if (m.metrics.is_expiring) {
        items.push({
          type: 'expiring',
          campaignId: m.campaign.id,
          label: `${m.campaign.id} — ${t('dashboard.expiringSoon')}`,
        });
      }
    }

    return items;
  }, [allMetrics, t]);

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
        <div className="flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
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
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Total Spend */}
        <Card className="rounded-xl p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-caption uppercase tracking-wide">{t('dashboard.totalSpend')}</p>
              <p className="kpi-value tabular-nums">{formatSAR(kpis.totalSpend)}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
        </Card>

        {/* Roshen Share */}
        <Card className="rounded-xl p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-caption uppercase tracking-wide">{t('dashboard.roshenShare')}</p>
              <p className="kpi-value tabular-nums">{formatSAR(kpis.roshenShare)}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-info/10 text-info">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
        </Card>

        {/* Total Uplift */}
        <Card className="rounded-xl p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-caption uppercase tracking-wide">{t('dashboard.totalUplift')}</p>
              <p className={`kpi-value tabular-nums ${valueColorClass(kpis.totalUplift)}`}>
                {formatSAR(kpis.totalUplift)}
              </p>
            </div>
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${
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
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Alerts Panel                                                       */}
      {/* ------------------------------------------------------------------ */}
      {alerts.length > 0 && (
        <section>
          <Card className="rounded-xl shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="heading-2 font-display flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" />
                {t('dashboard.alerts')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {alerts.map((alert, idx) => (
                  <li
                    key={`${alert.type}-${alert.campaignId ?? alert.customerAccount}-${idx}`}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-sm text-foreground">{alert.label}</span>
                    <Badge variant="warning" className="shrink-0">
                      {t('status.expiring')}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Campaign Summary Table                                             */}
      {/* ------------------------------------------------------------------ */}
      <section>
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="heading-2 font-display">
              {t('dashboard.totalCampaignsCount')} ({campaigns.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {allMetrics.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-caption">
                      <th className="py-2 text-left font-medium">ID</th>
                      <th className="py-2 text-left font-medium">{t('campaign.customer')}</th>
                      <th className="py-2 text-left font-medium">{t('campaign.spendType')}</th>
                      <th className="py-2 text-right font-medium">{t('campaign.spendAmount')}</th>
                      <th className="py-2 text-right font-medium">{t('dashboard.totalUplift')}</th>
                      <th className="py-2 text-center font-medium">{t('common.status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {allMetrics.map((m) => (
                      <tr key={m.campaign.id} className="hover:bg-muted/50 transition-colors">
                        <td className="py-2.5 font-medium">{m.campaign.id}</td>
                        <td className="py-2.5">{m.campaign.account}</td>
                        <td className="py-2.5">{m.campaign.spend_type}</td>
                        <td className="py-2.5 text-right tabular-nums">
                          {formatSAR(m.campaign.spend_amount)}
                        </td>
                        <td className={`py-2.5 text-right tabular-nums ${valueColorClass(m.metrics.uplift_value)}`}>
                          {formatSAR(m.metrics.uplift_value)}
                        </td>
                        <td className="py-2.5 text-center">
                          <Badge variant={STATUS_BADGE_VARIANT[m.campaign.status]}>
                            {t(`status.${m.campaign.status}`)}
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

// ---------------------------------------------------------------------------
// Unified Dashboard (All Distributors) — Executive Overview
// ---------------------------------------------------------------------------

const DIST_COLORS: Record<string, string> = {
  'dist-relaia': '#7A1D2E',
  'dist-tofola': '#2563EB',
  'dist-gulf': '#059669',
  'dist-tala': '#D97706',
};

function getDistColor(id: string): string {
  return DIST_COLORS[id] || '#6B7280';
}

const UNIFIED_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_distributor: 'Pending TM',
  pending_roshen: 'Pending Roshen',
  approved_pending_photos: 'Awaiting Photos',
  photos_submitted: 'Photos Submitted',
  final_approved: 'Final Approved',
  changes_requested: 'Changes Requested',
  rejected: 'Rejected',
};

const WORKFLOW_ACTION_LABELS: Record<string, string> = {
  created: 'Created',
  submitted: 'Submitted',
  edited: 'Edited',
  changes_requested: 'Requested Changes on',
  approved_distributor: 'Approved (Distributor)',
  approved_roshen: 'Approved (Roshen)',
  photos_added: 'Added Photos to',
  final_approved: 'Final Approved',
  rejected: 'Rejected',
  returned: 'Returned',
};

interface DistributorFullData {
  distId: string;
  distName: string;
  campaigns: Campaign[];
  customers: { account: string; name: string }[];
  users: TradeSpendUser[];
  workflowEvents: WorkflowEvent[];
  totalSpend: number;
  campaignCount: number;
  customerCount: number;
  statusCounts: Record<string, number>;
  activeCampaigns: number;
  topCustomerName: string | null;
  latestActivityDate: string | null;
}

function getDistributorFullData(distId: string, distName: string, currentDistId: string | null, storeState: {
  campaigns: Campaign[];
  customers: { account: string; name: string }[];
  users: TradeSpendUser[];
  workflowEvents: WorkflowEvent[];
}): DistributorFullData {
  let campaigns: Campaign[];
  let customers: { account: string; name: string }[];
  let users: TradeSpendUser[];
  let workflowEvents: WorkflowEvent[];

  if (distId === currentDistId) {
    campaigns = storeState.campaigns;
    customers = storeState.customers;
    users = storeState.users;
    workflowEvents = storeState.workflowEvents;
  } else {
    campaigns = JSON.parse(localStorage.getItem(`ts_${distId}_campaigns`) || '[]');
    customers = JSON.parse(localStorage.getItem(`ts_${distId}_customers`) || '[]');
    users = JSON.parse(localStorage.getItem(`ts_${distId}_users`) || '[]');
    workflowEvents = JSON.parse(localStorage.getItem(`ts_${distId}_workflowEvents`) || '[]');
  }

  const totalSpend = campaigns.reduce((s: number, c: Campaign) => s + (c.spend_amount || 0), 0);

  const statusCounts = campaigns.reduce((acc: Record<string, number>, c: Campaign) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {});

  const activeCampaigns = campaigns.filter(
    (c: Campaign) => !['final_approved', 'rejected'].includes(c.status),
  ).length;

  // Top customer by spend
  const spendByCustomer: Record<string, number> = {};
  for (const c of campaigns) {
    spendByCustomer[c.account] = (spendByCustomer[c.account] || 0) + c.spend_amount;
  }
  let topCustomerAccount: string | null = null;
  let topSpend = 0;
  for (const [acct, spend] of Object.entries(spendByCustomer)) {
    if (spend > topSpend) {
      topSpend = spend;
      topCustomerAccount = acct;
    }
  }
  const topCustomer = topCustomerAccount
    ? customers.find((c) => c.account === topCustomerAccount)
    : null;

  // Latest activity
  let latestActivityDate: string | null = null;
  if (workflowEvents.length > 0) {
    const sorted = [...workflowEvents].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    latestActivityDate = sorted[0].timestamp;
  }

  return {
    distId,
    distName,
    campaigns,
    customers,
    users,
    workflowEvents,
    totalSpend,
    campaignCount: campaigns.length,
    customerCount: customers.length,
    statusCounts,
    activeCampaigns,
    topCustomerName: topCustomer?.name ?? topCustomerAccount,
    latestActivityDate,
  };
}

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

function UnifiedDashboard() {
  const distributors = useTradeSpendStore((s) => s.distributors);
  const currentDistId = useTradeSpendStore((s) => s.currentDistributorId);
  const storeCampaigns = useTradeSpendStore((s) => s.campaigns);
  const storeCustomers = useTradeSpendStore((s) => s.customers);
  const storeUsers = useTradeSpendStore((s) => s.users);
  const storeWorkflowEvents = useTradeSpendStore((s) => s.workflowEvents);

  const [hoveredDist, setHoveredDist] = useState<string | null>(null);

  // Build full data for each active distributor
  const allDistData = useMemo(() => {
    const active = distributors.filter((d) => d.active);
    return active.map((d) =>
      getDistributorFullData(d.id, d.name, currentDistId, {
        campaigns: storeCampaigns,
        customers: storeCustomers,
        users: storeUsers,
        workflowEvents: storeWorkflowEvents,
      }),
    );
  }, [distributors, currentDistId, storeCampaigns, storeCustomers, storeUsers, storeWorkflowEvents]);

  // Grand totals
  const grandTotals = useMemo(() => {
    const totalSpend = allDistData.reduce((s, d) => s + d.totalSpend, 0);
    const totalCampaigns = allDistData.reduce((s, d) => s + d.campaignCount, 0);
    const totalCustomers = allDistData.reduce((s, d) => s + d.customerCount, 0);
    const activeCampaigns = allDistData.reduce((s, d) => s + d.activeCampaigns, 0);
    return { totalSpend, totalCampaigns, totalCustomers, activeCampaigns };
  }, [allDistData]);

  // Recent activity timeline (last 10 events across all distributors)
  const recentActivity = useMemo(() => {
    const allEvents: {
      distName: string;
      distId: string;
      actorName: string;
      action: string;
      campaignId: string;
      timestamp: string;
    }[] = [];

    for (const dist of allDistData) {
      for (const evt of dist.workflowEvents) {
        const actor = dist.users.find((u) => u.id === evt.actor_user_id);
        allEvents.push({
          distName: dist.distName,
          distId: dist.distId,
          actorName: actor?.display_name ?? evt.actor_user_id,
          action: WORKFLOW_ACTION_LABELS[evt.action] ?? evt.action,
          campaignId: evt.campaign_id,
          timestamp: evt.timestamp,
        });
      }
    }

    allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return allEvents.slice(0, 10);
  }, [allDistData]);

  // Spend distribution for stacked bar
  const spendDistribution = useMemo(() => {
    if (grandTotals.totalSpend === 0) return [];
    return allDistData
      .filter((d) => d.totalSpend > 0)
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .map((d) => ({
        distId: d.distId,
        distName: d.distName,
        spend: d.totalSpend,
        pct: Math.round((d.totalSpend / grandTotals.totalSpend) * 100),
        color: getDistColor(d.distId),
      }));
  }, [allDistData, grandTotals.totalSpend]);

  const activeDistCount = distributors.filter((d) => d.active).length;

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                             */}
      {/* ------------------------------------------------------------------ */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
              <Crown className="h-5 w-5" />
            </div>
            <h1 className="heading-1 font-display">Executive Dashboard</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground ml-[52px]">
            Real-time overview across {activeDistCount} active distributor{activeDistCount !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Live Data
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Row 1 — Grand Total KPIs                                          */}
      {/* ------------------------------------------------------------------ */}
      <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Spend */}
        <Card className="relative overflow-hidden rounded-xl border shadow-sm">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Total Spend
                </p>
                <p className="kpi-value tabular-nums text-2xl sm:text-3xl font-bold tracking-tight">
                  {formatSAR(grandTotals.totalSpend)}
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                <DollarSign className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total Campaigns */}
        <Card className="relative overflow-hidden rounded-xl border shadow-sm">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none" />
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Total Campaigns
                </p>
                <p className="kpi-value tabular-nums text-2xl sm:text-3xl font-bold tracking-tight">
                  {grandTotals.totalCampaigns}
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                <Layers className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total Customers */}
        <Card className="relative overflow-hidden rounded-xl border shadow-sm">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent pointer-events-none" />
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Total Customers
                </p>
                <p className="kpi-value tabular-nums text-2xl sm:text-3xl font-bold tracking-tight">
                  {grandTotals.totalCustomers}
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0">
                <Users className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Active Campaigns */}
        <Card className="relative overflow-hidden rounded-xl border shadow-sm">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent pointer-events-none" />
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Active Campaigns
                </p>
                <p className="kpi-value tabular-nums text-2xl sm:text-3xl font-bold tracking-tight">
                  {grandTotals.activeCampaigns}
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                <Zap className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Row 2 — Per-Distributor Breakdown Cards                            */}
      {/* ------------------------------------------------------------------ */}
      <section>
        <h2 className="heading-2 font-display mb-4 flex items-center gap-2">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          Distributor Breakdown
        </h2>
        <div className="grid gap-5 grid-cols-1 md:grid-cols-2">
          {allDistData.map((dist) => {
            const color = getDistColor(dist.distId);
            const activeRate =
              dist.campaignCount > 0
                ? Math.round((dist.activeCampaigns / dist.campaignCount) * 100)
                : 0;

            return (
              <Card
                key={dist.distId}
                className="group relative overflow-hidden rounded-xl border shadow-sm transition-all duration-200 hover:shadow-md"
              >
                {/* Colored top accent */}
                <div className="h-1 w-full" style={{ backgroundColor: color }} />

                <CardContent className="p-5 space-y-5">
                  {/* Distributor Header */}
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-white text-sm font-bold shrink-0"
                      style={{ backgroundColor: color }}
                    >
                      {dist.distName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold font-display truncate">
                        {dist.distName}
                      </h3>
                    </div>
                  </div>

                  {/* Quick Stats Grid */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg bg-muted/50 p-3 text-center">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Campaigns
                      </p>
                      <p className="text-xl font-bold tabular-nums mt-0.5">
                        {dist.campaignCount}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3 text-center">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Customers
                      </p>
                      <p className="text-xl font-bold tabular-nums mt-0.5">
                        {dist.customerCount}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3 text-center">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Total Spend
                      </p>
                      <p className="text-lg font-bold tabular-nums mt-0.5">
                        {formatSAR(dist.totalSpend)}
                      </p>
                    </div>
                  </div>

                  {/* Active Campaigns Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground font-medium">Active Campaigns</span>
                      <span className="font-semibold tabular-nums" style={{ color }}>
                        {activeRate}%
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500 ease-out"
                        style={{
                          width: `${activeRate}%`,
                          backgroundColor: color,
                          opacity: 0.85,
                        }}
                      />
                    </div>
                  </div>

                  {/* Status Breakdown */}
                  {Object.keys(dist.statusCounts).length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        By Status
                      </p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        {Object.entries(dist.statusCounts)
                          .sort(([, a], [, b]) => b - a)
                          .map(([status, count]) => (
                            <div key={status} className="flex items-center gap-2 text-sm">
                              <div
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ backgroundColor: color, opacity: 0.7 }}
                              />
                              <span className="text-muted-foreground text-xs truncate flex-1">
                                {UNIFIED_STATUS_LABELS[status] ?? status}
                              </span>
                              <span className="font-semibold tabular-nums text-xs">
                                {count}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Footer: Top Customer + Latest Activity */}
                  <div className="flex flex-col gap-1.5 pt-2 border-t border-border/50 text-xs text-muted-foreground">
                    {dist.topCustomerName && (
                      <div className="flex items-center gap-1.5">
                        <ShoppingBag className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          <span className="font-medium text-foreground/70">Top Customer:</span>{' '}
                          {dist.topCustomerName}
                        </span>
                      </div>
                    )}
                    {dist.latestActivityDate && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3 shrink-0" />
                        <span>
                          <span className="font-medium text-foreground/70">Latest Activity:</span>{' '}
                          {formatTimeAgo(dist.latestActivityDate)}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Row 3 — Spend Distribution (Stacked Bar)                           */}
      {/* ------------------------------------------------------------------ */}
      {spendDistribution.length > 0 && (
        <section>
          <Card className="rounded-xl border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="heading-2 font-display flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                Spend Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Stacked horizontal bar */}
              <div className="h-10 w-full rounded-lg overflow-hidden flex">
                {spendDistribution.map((d) => (
                  <div
                    key={d.distId}
                    className="h-full flex items-center justify-center text-white text-xs font-semibold transition-opacity duration-200 cursor-default relative"
                    style={{
                      width: `${Math.max(d.pct, 3)}%`,
                      backgroundColor: d.color,
                      opacity: hoveredDist === null || hoveredDist === d.distId ? 1 : 0.35,
                    }}
                    onMouseEnter={() => setHoveredDist(d.distId)}
                    onMouseLeave={() => setHoveredDist(null)}
                    title={`${d.distName}: ${formatSAR(d.spend)} (${d.pct}%)`}
                  >
                    {d.pct >= 10 && (
                      <span className="truncate px-1">{d.pct}%</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {spendDistribution.map((d) => (
                  <div
                    key={d.distId}
                    className="flex items-center gap-2 text-sm cursor-default transition-opacity duration-200"
                    style={{
                      opacity: hoveredDist === null || hoveredDist === d.distId ? 1 : 0.4,
                    }}
                    onMouseEnter={() => setHoveredDist(d.distId)}
                    onMouseLeave={() => setHoveredDist(null)}
                  >
                    <div
                      className="h-3 w-3 rounded-sm shrink-0"
                      style={{ backgroundColor: d.color }}
                    />
                    <span className="font-medium">{d.distName}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {formatSAR(d.spend)} ({d.pct}%)
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Row 4 — Recent Activity Timeline                                   */}
      {/* ------------------------------------------------------------------ */}
      {recentActivity.length > 0 && (
        <section>
          <Card className="rounded-xl border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="heading-2 font-display flex items-center gap-2">
                <Activity className="h-5 w-5 text-muted-foreground" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

                <ul className="space-y-0">
                  {recentActivity.map((evt, idx) => (
                    <li
                      key={`${evt.campaignId}-${evt.timestamp}-${idx}`}
                      className="relative flex items-start gap-4 py-3 first:pt-0 last:pb-0"
                    >
                      {/* Timeline dot */}
                      <div
                        className="relative z-10 mt-1.5 h-[15px] w-[15px] rounded-full border-2 border-background shrink-0"
                        style={{ backgroundColor: getDistColor(evt.distId) }}
                      />

                      {/* Event content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <span className="font-semibold">{evt.actorName}</span>
                          <span className="text-muted-foreground"> ({evt.distName})</span>
                          <span className="text-muted-foreground"> &mdash; </span>
                          <span className="font-medium">{evt.action}</span>
                          <span className="text-muted-foreground"> </span>
                          <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                            {evt.campaignId}
                          </span>
                        </p>
                      </div>

                      {/* Time */}
                      <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap shrink-0 mt-0.5">
                        {formatTimeAgo(evt.timestamp)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ================================================================== */}
      {/* Row 5 — All Customers Summary Table                                */}
      {/* ================================================================== */}
      <section>
        <Card className="rounded-xl shadow-sm overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="heading-2 flex items-center gap-2">
              <Users className="h-5 w-5" />
              Customer Summary — All Distributors
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2.5 text-start font-semibold">Distributor</th>
                    <th className="px-3 py-2.5 text-start font-semibold">Customer</th>
                    <th className="px-3 py-2.5 text-start font-semibold">Classification</th>
                    <th className="px-3 py-2.5 text-end font-semibold">Campaigns</th>
                    <th className="px-3 py-2.5 text-end font-semibold">Spend (SAR)</th>
                    <th className="px-3 py-2.5 text-end font-semibold">Sales Before</th>
                    <th className="px-3 py-2.5 text-end font-semibold">Sales After</th>
                    <th className="px-3 py-2.5 text-end font-semibold">Uplift</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const rows: Array<{
                      distName: string; distColor: string; custName: string;
                      classification: string; campaigns: number; spend: number;
                      before: number; after: number;
                    }> = [];
                    for (const dd of allDistData) {
                      const custCampaigns = new Map<string, typeof dd.campaigns>();
                      for (const c of dd.campaigns) {
                        const list = custCampaigns.get(c.account) || [];
                        list.push(c);
                        custCampaigns.set(c.account, list);
                      }
                      for (const cust of dd.customers) {
                        const cc = custCampaigns.get(cust.account);
                        if (!cc || cc.length === 0) continue;
                        const spend = cc.reduce((s: number, c: any) => s + (c.spend_amount || 0), 0);
                        rows.push({
                          distName: dd.distName,
                          distColor: getDistColor(dd.distId),
                          custName: cust.name,
                          classification: (cust as any).classification || '',
                          campaigns: cc.length,
                          spend,
                          before: 0,
                          after: 0,
                        });
                      }
                    }
                    if (rows.length === 0) {
                      return (
                        <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">No customer data</td></tr>
                      );
                    }
                    return rows.sort((a, b) => b.spend - a.spend).map((row, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: row.distColor }} />
                            <span className="font-medium">{row.distName}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 font-medium">{row.custName}</td>
                        <td className="px-3 py-2">
                          {row.classification && (
                            <Badge variant="secondary" className="text-[9px] capitalize">{row.classification}</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-end tabular-nums">{row.campaigns}</td>
                        <td className="px-3 py-2 text-end tabular-nums font-medium">{row.spend.toLocaleString()}</td>
                        <td className="px-3 py-2 text-end tabular-nums text-muted-foreground">—</td>
                        <td className="px-3 py-2 text-end tabular-nums text-muted-foreground">—</td>
                        <td className="px-3 py-2 text-end tabular-nums text-muted-foreground">—</td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function DashboardPage() {
  const { t } = useTranslation();
  const viewMode = useTradeSpendStore((s) => s.viewMode);
  const campaigns = useTradeSpendStore((s) => s.campaigns);
  const transactions = useTradeSpendStore((s) => s.transactions);
  const customers = useTradeSpendStore((s) => s.customers);
  const items = useTradeSpendStore((s) => s.items);
  const latestDataDate = useTradeSpendStore((s) => s.latestDataDate);
  const currentUser = useTradeSpendStore((s) => s.currentUser);

  // Unified dashboard mode
  if (viewMode === 'unified_dashboard') return <UnifiedDashboard />;

  // Determine view type based on user roles
  const isFullView = useMemo(
    () => currentUser?.roles.some((r) => r === 'roshen_approver') ?? false,
    [currentUser],
  );

  // Compute metrics for every campaign
  const allMetrics: CampaignWithMetrics[] = useMemo(() => {
    if (campaigns.length === 0 || transactions.length === 0) return [];
    return campaigns.map((c) => ({
      campaign: c,
      metrics: computeCampaignMetrics(c, transactions, latestDataDate),
    }));
  }, [campaigns, transactions, latestDataDate]);

  // Build item lookup
  const itemDescMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const item of items) {
      m.set(item.id, item.description);
    }
    return m;
  }, [items]);

  // Build customer lookup
  const customerMap = useMemo(() => {
    const m = new Map<string, typeof customers[0]>();
    for (const c of customers) {
      m.set(c.account, c);
    }
    return m;
  }, [customers]);

  // Build customer card data for simple view
  const customerCards: CustomerCardData[] = useMemo(() => {
    if (allMetrics.length === 0) return [];

    // Group campaigns by customer account
    const grouped = new Map<string, CampaignWithMetrics[]>();
    for (const cm of allMetrics) {
      const key = cm.campaign.account;
      const arr = grouped.get(key) ?? [];
      arr.push(cm);
      grouped.set(key, arr);
    }

    const cards: CustomerCardData[] = [];
    for (const [account, campaignMetrics] of grouped) {
      const customer = customerMap.get(account);

      // Collect all unique item names across campaigns for this customer
      const allItemIds = new Set<string>();
      for (const cm of campaignMetrics) {
        for (const id of cm.campaign.item_ids) {
          allItemIds.add(id);
        }
      }
      const itemNames = Array.from(allItemIds).map(
        (id) => itemDescMap.get(id) ?? id,
      );

      // Sum sales before/after across all campaigns
      const salesBefore = campaignMetrics.reduce(
        (s, cm) => s + cm.metrics.selected_before_value,
        0,
      );
      const salesAfter = campaignMetrics.reduce(
        (s, cm) => s + cm.metrics.selected_after_value,
        0,
      );

      cards.push({
        account,
        name: customer?.name ?? account,
        classification: customer?.classification,
        itemNames,
        salesBefore,
        salesAfter,
        campaignCount: campaignMetrics.length,
        campaignStatuses: campaignMetrics.map((cm) => cm.campaign.status),
      });
    }

    // Sort by campaign count desc
    cards.sort((a, b) => b.campaignCount - a.campaignCount);
    return cards;
  }, [allMetrics, customerMap, itemDescMap]);

  // ------ Edge case: no campaigns ------
  if (campaigns.length === 0) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="heading-1 font-display">
            {isFullView ? t('dashboard.title') : t('dashboard.simpleTitle')}
          </h1>
        </header>
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-card px-8 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <BarChart3 className="h-7 w-7" />
          </div>
          <h2 className="heading-2 font-display text-foreground">
            No campaigns yet
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Create your first trade spend campaign to start seeing data on this dashboard.
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
          <h1 className="heading-1 font-display">
            {isFullView ? t('dashboard.title') : t('dashboard.simpleTitle')}
          </h1>
        </header>
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-card px-8 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-warning/10 text-warning">
            <FileWarning className="h-7 w-7" />
          </div>
          <h2 className="heading-2 font-display text-foreground">
            No sales data uploaded
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Upload raw sales transaction data so the platform can compute campaign metrics.
          </p>
        </div>
      </div>
    );
  }

  // ------ Render appropriate view ------
  if (isFullView) {
    return (
      <FullDashboardView
        allMetrics={allMetrics}
        campaigns={campaigns}
        latestDataDate={latestDataDate}
        t={t}
      />
    );
  }

  return (
    <SimpleDashboardView
      customerCards={customerCards}
      totalCampaigns={campaigns.length}
      totalCustomers={customerCards.length}
      t={t}
    />
  );
}
