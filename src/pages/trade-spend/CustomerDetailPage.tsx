import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  FileSpreadsheet,
  FileText,
  Presentation,
  AlertTriangle,
  Clock,
  Camera,
  Package,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useTradeSpendStore } from '@/stores/tradeSpendStore';
import { computeCampaignMetrics } from '@/lib/trade-spend/engine';
import { exportToExcel, exportToPDF, exportToPPTX } from '@/lib/trade-spend/exports';
import type { Campaign, CampaignMetrics, CampaignStatus } from '@/lib/trade-spend/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSAR(n: number): string {
  return `﷼ ${n.toLocaleString('en-SA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatNumber(n: number | null): string {
  if (n == null) return '--';
  return n.toLocaleString('en-SA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function valueColorClass(value: number | null): string {
  if (value == null) return '';
  if (value > 0) return 'text-success';
  if (value < 0) return 'text-destructive';
  return '';
}

// ---------------------------------------------------------------------------
// Status badge configuration
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<CampaignStatus, { variant: 'secondary' | 'warning' | 'info' | 'success' | 'destructive'; label: string }> = {
  draft: { variant: 'secondary', label: 'Draft' },
  pending_distributor: { variant: 'warning', label: 'Pending Distributor' },
  pending_roshen: { variant: 'info', label: 'Pending Roshen' },
  approved_pending_photos: { variant: 'info', label: 'Awaiting Photos' },
  photos_submitted: { variant: 'warning', label: 'Photos Submitted' },
  final_approved: { variant: 'success', label: 'Final Approved' },
  changes_requested: { variant: 'destructive', label: 'Changes Requested' },
  rejected: { variant: 'destructive', label: 'Rejected' },
};

// ---------------------------------------------------------------------------
// Duration display helper
// ---------------------------------------------------------------------------

function formatDuration(campaign: Campaign): string {
  if (campaign.duration_key === 'none') return 'No fixed duration';
  const map: Record<string, string> = {
    '1m': '1 Month',
    '3m': '3 Months',
    '6m': '6 Months',
    '1y': '1 Year',
  };
  return map[campaign.duration_key] ?? campaign.duration_key;
}

// ---------------------------------------------------------------------------
// Campaign Card
// ---------------------------------------------------------------------------

interface CampaignCardProps {
  campaign: Campaign;
  metrics: CampaignMetrics;
  items: Map<string, string>;
  spendTypes: Map<string, string>;
  isPrivileged: boolean;
  t: (key: string) => string;
}

function CampaignCard({ campaign, metrics, items, spendTypes, isPrivileged, t }: CampaignCardProps) {
  const statusCfg = STATUS_CONFIG[campaign.status];
  const spendTypeName = spendTypes.get(campaign.spend_type) ?? campaign.spend_type;
  const totalSpend = campaign.spend_amount;
  const roshenPct = totalSpend > 0 ? (metrics.roshen_share / totalSpend) * 100 : 0;
  const distPct = 100 - roshenPct;

  return (
    <Card className="overflow-hidden">
      {/* Campaign header */}
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CardTitle className="heading-2 font-display">{campaign.id}</CardTitle>
            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{spendTypeName}</span>
            <span className="text-border">|</span>
            <span>{formatDuration(campaign)}</span>
            <span className="text-border">|</span>
            <span>{campaign.start_date}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Expiring Soon warning */}
        {metrics.is_expiring && (
          <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
            <Clock className="h-4 w-4 shrink-0" />
            <span>{t('customerDetail.expiringSoon')}</span>
            <Badge variant="warning" className="ml-auto">{t('status.expiring')}</Badge>
          </div>
        )}

        {/* ---- Metrics Grid ---- */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Selected Items: Before vs After */}
          <div className="space-y-1 rounded-lg border border-border p-3">
            <p className="text-caption uppercase tracking-wide">{t('customerDetail.selectedItems')}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-sm text-muted-foreground">{t('customerDetail.before')}:</span>
              <span className="tabular-nums font-medium">{formatSAR(metrics.selected_before_value)}</span>
              <span className="text-xs text-muted-foreground">/ {formatNumber(metrics.selected_before_cases)} cs</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm text-muted-foreground">{t('customerDetail.after')}:</span>
              <span className="tabular-nums font-medium">{formatSAR(metrics.selected_after_value)}</span>
              <span className="text-xs text-muted-foreground">/ {formatNumber(metrics.selected_after_cases)} cs</span>
            </div>
          </div>

          {/* All Customer Items: Before vs After */}
          <div className="space-y-1 rounded-lg border border-border p-3">
            <p className="text-caption uppercase tracking-wide">{t('customerDetail.allItems')}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-sm text-muted-foreground">{t('customerDetail.before')}:</span>
              <span className="tabular-nums font-medium">{formatSAR(metrics.all_before_value)}</span>
              <span className="text-xs text-muted-foreground">/ {formatNumber(metrics.all_before_cases)} cs</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm text-muted-foreground">{t('customerDetail.after')}:</span>
              <span className="tabular-nums font-medium">{formatSAR(metrics.all_after_value)}</span>
              <span className="text-xs text-muted-foreground">/ {formatNumber(metrics.all_after_cases)} cs</span>
            </div>
          </div>

          {/* Uplift (Value) */}
          <div className="space-y-1 rounded-lg border border-border p-3">
            <p className="text-caption uppercase tracking-wide">{t('customerDetail.upliftValue')}</p>
            <p className={`text-lg font-semibold tabular-nums ${valueColorClass(metrics.uplift_value)}`}>
              {formatSAR(metrics.uplift_value)}
            </p>
          </div>
        </div>

        {/* ---- Cost Split Bar (privileged users only) ---- */}
        {isPrivileged && (
          <div className="space-y-2">
            <p className="text-caption uppercase tracking-wide font-medium">{t('customerDetail.costSplit')}</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex h-7 rounded-full overflow-hidden border border-border">
                <div
                  className="flex items-center justify-center bg-primary text-primary-foreground text-xs font-medium"
                  style={{ width: `${roshenPct}%` }}
                >
                  {roshenPct >= 15 && `Roshen ${roshenPct.toFixed(0)}%`}
                </div>
                <div
                  className="flex items-center justify-center bg-accent text-accent-foreground text-xs font-medium"
                  style={{ width: `${distPct}%` }}
                >
                  {distPct >= 15 && `Dist ${distPct.toFixed(0)}%`}
                </div>
              </div>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Roshen: {formatSAR(metrics.roshen_share)}</span>
              <span>Distributor: {formatSAR(metrics.distributor_share)}</span>
            </div>
          </div>
        )}

        {/* ---- Data Completeness ---- */}
        {!metrics.data_completeness.is_complete && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-caption uppercase tracking-wide font-medium">
                {t('customerDetail.dataCompleteness')}
              </p>
              <Badge variant="warning">{t('common.provisional')}</Badge>
            </div>
            <Progress
              value={metrics.data_completeness.captured_days}
              max={metrics.data_completeness.total_days}
            />
            <p className="text-xs text-muted-foreground">
              {metrics.data_completeness.captured_days} of {metrics.data_completeness.total_days} days captured
            </p>
          </div>
        )}

        {/* ---- Branch Photos ---- */}
        {campaign.branches.length > 0 && (
          <div className="space-y-2">
            <p className="text-caption uppercase tracking-wide font-medium">
              {t('customerDetail.branchPhotos')} ({campaign.branches.length})
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {campaign.branches.map((branch) => (
                <div
                  key={branch.id}
                  className="flex flex-col items-center gap-2 rounded-lg border border-border p-3"
                >
                  {branch.photo_url ? (
                    <img
                      src={branch.photo_url}
                      alt={branch.branch_name}
                      className="h-24 w-full rounded-md object-cover"
                    />
                  ) : (
                    <div className="flex h-24 w-full items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Camera className="h-8 w-8" />
                    </div>
                  )}
                  <p className="text-xs text-center font-medium">{branch.branch_name}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---- Selected Items ---- */}
        {campaign.item_ids.length > 0 && (
          <div className="space-y-2">
            <p className="text-caption uppercase tracking-wide font-medium">
              {t('customerDetail.selectedItemsList')} ({campaign.item_ids.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {campaign.item_ids.map((itemId) => (
                <Badge key={itemId} variant="outline" className="gap-1.5">
                  <Package className="h-3 w-3" />
                  {items.get(itemId) ?? itemId}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export function CustomerDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { account } = useParams<{ account: string }>();

  const customers = useTradeSpendStore((s) => s.customers);
  const campaigns = useTradeSpendStore((s) => s.campaigns);
  const transactions = useTradeSpendStore((s) => s.transactions);
  const latestDataDate = useTradeSpendStore((s) => s.latestDataDate);
  const storeItems = useTradeSpendStore((s) => s.items);
  const spendTypes = useTradeSpendStore((s) => s.spendTypes);
  const currentUser = useTradeSpendStore((s) => s.currentUser);

  const isPrivileged = useMemo(
    () => currentUser?.roles.some((r) => ['roshen_approver', 'admin'].includes(r)) ?? false,
    [currentUser],
  );

  // Build lookup maps
  const itemsMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const item of storeItems) {
      m.set(item.id, item.description);
    }
    return m;
  }, [storeItems]);

  const spendTypesMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const st of spendTypes) {
      m.set(st.id, st.name);
    }
    return m;
  }, [spendTypes]);

  // Find customer
  const customer = useMemo(
    () => customers.find((c) => c.account === account),
    [customers, account],
  );

  // Find campaigns for this customer
  const customerCampaigns = useMemo(
    () => campaigns.filter((c) => c.account === account),
    [campaigns, account],
  );

  // Compute metrics for each campaign
  const campaignsWithMetrics = useMemo(() => {
    return customerCampaigns.map((c) => ({
      campaign: c,
      metrics: computeCampaignMetrics(c, transactions, latestDataDate),
    }));
  }, [customerCampaigns, transactions, latestDataDate]);

  function buildExportData() {
    if (!customer) return null;
    const storeUsers = useTradeSpendStore.getState().users;
    const storeItems = useTradeSpendStore.getState().items;
    const campaignExports = customerCampaigns.map((c) => {
      const creator = storeUsers.find((u) => u.id === c.created_by);
      return {
        id: c.id,
        customerName: customer.name,
        customerAccount: customer.account,
        classification: c.classification || customer.classification || '',
        spendType: spendTypesMap.get(c.spend_type) || c.spend_type,
        duration: c.duration_key === 'none' ? 'Open-ended' : c.duration_key,
        items: c.item_ids.map((id) => storeItems.find((i) => i.id === id)?.description || id),
        spendAmount: c.spend_amount,
        roshenPct: c.roshen_pct,
        roshenShare: c.spend_amount * c.roshen_pct / 100,
        distributorShare: c.spend_amount * (100 - c.roshen_pct) / 100,
        startDate: c.start_date,
        status: c.status,
        createdBy: creator?.display_name || c.created_by,
        createdAt: c.created_at,
        approvedDistributorAt: c.approved_distributor_at,
        approvedRoshenAt: c.approved_roshen_at,
        branches: c.branches.map((b) => ({ name: b.branch_name, photoUrl: b.photo_url })),
      };
    });
    return {
      title: `${customer.name} — Trade Spend Requests`,
      date: new Date().toISOString().substring(0, 10),
      campaigns: campaignExports,
    };
  }

  // Customer not found
  if (!customer) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => navigate('/trade-spend/customers')}
        >
          <ArrowLeft className="h-4 w-4" />
          {t('customerDetail.backToCustomers')}
        </Button>

        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-card px-8 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h2 className="heading-2 font-display text-foreground">
            {t('customerDetail.notFound')}
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Customer with account "{account}" was not found.
          </p>
        </div>
      </div>
    );
  }

  // No campaigns for this customer
  if (customerCampaigns.length === 0) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => navigate('/trade-spend/customers')}
        >
          <ArrowLeft className="h-4 w-4" />
          {t('customerDetail.backToCustomers')}
        </Button>

        <header className="flex items-center gap-3">
          <h1 className="heading-1 font-display">{customer.name}</h1>
          <span className="font-mono text-sm text-muted-foreground">{customer.account}</span>
          {customer.classification && (
            <Badge variant="secondary">{customer.classification}</Badge>
          )}
        </header>

        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-card px-8 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Package className="h-7 w-7" />
          </div>
          <h2 className="heading-2 font-display text-foreground">
            {t('customerDetail.noCampaigns')}
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            This customer does not have any campaigns yet.
          </p>
        </div>
      </div>
    );
  }

  // Aggregate summary stats for the header
  const summary = useMemo(() => {
    const totalSpend = customerCampaigns.reduce((s, c) => s + c.spend_amount, 0);
    const totalUplift = campaignsWithMetrics.reduce(
      (s, m) => s + m.metrics.uplift_value,
      0,
    );
    return { totalSpend, totalUplift };
  }, [customerCampaigns, campaignsWithMetrics]);

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5"
        onClick={() => navigate('/trade-spend/customers')}
      >
        <ArrowLeft className="h-4 w-4" />
        {t('customerDetail.backToCustomers')}
      </Button>

      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="heading-1 font-display">{customer.name}</h1>
            {customer.classification && (
              <Badge variant="secondary">{customer.classification}</Badge>
            )}
          </div>
          <p className="font-mono text-sm text-muted-foreground">{customer.account}</p>
        </div>

        {/* Export buttons */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
            const data = buildExportData();
            if (data) exportToExcel(data);
          }}>
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
            const data = buildExportData();
            if (data) exportToPDF(data);
          }}>
            <FileText className="h-4 w-4" />
            PDF
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
            const data = buildExportData();
            if (data) exportToPPTX(data);
          }}>
            <Presentation className="h-4 w-4" />
            PPT
          </Button>
        </div>
      </header>

      {/* Summary KPI cards */}
      <section className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-caption uppercase tracking-wide">{t('customerDetail.totalCampaigns')}</p>
          <p className="kpi-value tabular-nums mt-1">{customerCampaigns.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-caption uppercase tracking-wide">{t('customerDetail.totalSpend')}</p>
          <p className="kpi-value tabular-nums mt-1">{formatSAR(summary.totalSpend)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-caption uppercase tracking-wide">{t('customerDetail.totalUplift')}</p>
          <p className={`kpi-value tabular-nums mt-1 ${valueColorClass(summary.totalUplift)}`}>
            {formatSAR(summary.totalUplift)}
          </p>
          <div className="mt-1">
            {summary.totalUplift >= 0 ? (
              <TrendingUp className="h-4 w-4 text-success inline" />
            ) : (
              <TrendingDown className="h-4 w-4 text-destructive inline" />
            )}
          </div>
        </Card>
      </section>

      {/* Campaign Cards */}
      <section className="space-y-4">
        <h2 className="heading-2 font-display">
          {t('customerDetail.campaignsTitle')} ({customerCampaigns.length})
        </h2>

        {campaignsWithMetrics.map(({ campaign, metrics }) => (
          <CampaignCard
            key={campaign.id}
            campaign={campaign}
            metrics={metrics}
            items={itemsMap}
            spendTypes={spendTypesMap}
            isPrivileged={isPrivileged}
            t={t}
          />
        ))}
      </section>
    </div>
  );
}
