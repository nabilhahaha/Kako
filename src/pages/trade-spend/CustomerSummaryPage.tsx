import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpDown,
  Search,
  FileSpreadsheet,
  FileText,
  Presentation,
  Users,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTradeSpendStore } from '@/stores/tradeSpendStore';
import { computeCampaignMetrics } from '@/lib/trade-spend/engine';
import { exportToExcel, exportToPDF, exportToPPTX } from '@/lib/trade-spend/exports';
import type { CampaignExport } from '@/lib/trade-spend/exports';
import type { CampaignMetrics } from '@/lib/trade-spend/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSAR(n: number): string {
  return `﷼ ${n.toLocaleString('en-SA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatPct(n: number | null): string {
  if (n == null) return '--';
  return `${n.toFixed(1)}%`;
}

function valueColorClass(value: number): string {
  if (value > 0) return 'text-success';
  if (value < 0) return 'text-destructive';
  return '';
}

// ---------------------------------------------------------------------------
// Aggregated customer row
// ---------------------------------------------------------------------------

interface CustomerRow {
  account: string;
  name: string;
  classification: string;
  campaignCount: number;
  totalSpend: number;
  roshenShare: number;
  distributorShare: number;
  salesBefore: number;
  salesAfter: number;
  uplift: number;
  roiTotal: number | null;
  roiRoshen: number | null;
  spendToSales: number | null;
}

type SortKey = keyof CustomerRow;
type SortDir = 'asc' | 'desc';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CustomerSummaryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const customers = useTradeSpendStore((s) => s.customers);
  const campaigns = useTradeSpendStore((s) => s.campaigns);
  const transactions = useTradeSpendStore((s) => s.transactions);
  const latestDataDate = useTradeSpendStore((s) => s.latestDataDate);

  // Filters
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>('account');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Compute aggregated metrics per customer
  const rows: CustomerRow[] = useMemo(() => {
    // Group campaigns by account
    const campaignsByAccount = new Map<string, typeof campaigns>();
    for (const c of campaigns) {
      const existing = campaignsByAccount.get(c.account) ?? [];
      existing.push(c);
      campaignsByAccount.set(c.account, existing);
    }

    const result: CustomerRow[] = [];

    for (const customer of customers) {
      const custCampaigns = campaignsByAccount.get(customer.account);
      if (!custCampaigns || custCampaigns.length === 0) continue;

      // Compute metrics for each campaign
      const allMetrics: CampaignMetrics[] = custCampaigns.map((c) =>
        computeCampaignMetrics(c, transactions, latestDataDate),
      );

      const totalSpend = custCampaigns.reduce((s, c) => s + c.spend_amount, 0);
      const roshenShare = allMetrics.reduce((s, m) => s + m.roshen_share, 0);
      const distributorShare = allMetrics.reduce((s, m) => s + m.distributor_share, 0);
      const salesBefore = allMetrics.reduce((s, m) => s + m.selected_before_value, 0);
      const salesAfter = allMetrics.reduce((s, m) => s + m.selected_after_value, 0);
      const uplift = salesAfter - salesBefore;

      const roiTotal =
        totalSpend !== 0 ? ((uplift - totalSpend) / totalSpend) * 100 : null;
      const roiRoshen =
        roshenShare !== 0 ? ((uplift - roshenShare) / roshenShare) * 100 : null;
      const spendToSales =
        salesAfter !== 0 ? (roshenShare / salesAfter) * 100 : null;

      result.push({
        account: customer.account,
        name: customer.name,
        classification: customer.classification ?? '',
        campaignCount: custCampaigns.length,
        totalSpend,
        roshenShare,
        distributorShare,
        salesBefore,
        salesAfter,
        uplift,
        roiTotal,
        roiRoshen,
        spendToSales,
      });
    }

    return result;
  }, [customers, campaigns, transactions, latestDataDate]);

  // Available classifications for filter dropdown
  const classifications = useMemo(() => {
    const set = new Set(rows.map((r) => r.classification).filter(Boolean));
    return Array.from(set).sort();
  }, [rows]);

  // Filter
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !r.account.toLowerCase().includes(q)) {
        return false;
      }
      if (classFilter && r.classification !== classFilter) return false;
      return true;
    });
  }, [rows, search, classFilter]);

  // Sort
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      // Handle nulls
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortDir === 'asc' ? 1 : -1;
      if (bVal == null) return sortDir === 'asc' ? -1 : 1;

      let cmp: number;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        cmp = aVal.localeCompare(bVal);
      } else {
        cmp = (aVal as number) - (bVal as number);
      }

      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  // Toggle sort
  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  // Column header helper
  function SortHeader({ label, field }: { label: string; field: SortKey }) {
    const active = sortKey === field;
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 text-left font-medium hover:text-foreground transition-colors"
        onClick={() => handleSort(field)}
      >
        {label}
        <ArrowUpDown
          className={`h-3 w-3 shrink-0 ${active ? 'text-foreground' : 'text-muted-foreground/50'}`}
        />
      </button>
    );
  }

  function buildExportData() {
    const users = useTradeSpendStore.getState().users;
    const items = useTradeSpendStore.getState().items;
    const campaignExports: CampaignExport[] = campaigns.map((c) => {
      const cust = customers.find((cu) => cu.account === c.account);
      const creator = users.find((u) => u.id === c.created_by);
      return {
        id: c.id,
        customerName: cust?.name || c.account,
        customerAccount: c.account,
        classification: c.classification || cust?.classification || '',
        spendType: c.spend_type,
        duration: c.duration_key === 'none' ? 'Open-ended' : c.duration_key,
        items: c.item_ids.map((id) => items.find((i) => i.id === id)?.description || id),
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
      title: 'Trade Spend Requests',
      date: new Date().toISOString().substring(0, 10),
      campaigns: campaignExports,
    };
  }

  // Edge case: no customers with campaigns
  if (rows.length === 0) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="heading-1 font-display">{t('customerSummary.title')}</h1>
        </header>
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-card px-8 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Users className="h-7 w-7" />
          </div>
          <h2 className="heading-2 font-display text-foreground">
            {t('customerSummary.noCampaigns')}
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            No customers with active campaigns found. Create a campaign to see customer-level analytics.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page title */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="heading-1 font-display">{t('customerSummary.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {sorted.length} {t('customerSummary.customersWithCampaigns')}
          </p>
        </div>

        {/* Export buttons */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
            const data = buildExportData();
            exportToExcel(data);
          }}>
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
            const data = buildExportData();
            exportToPDF(data);
          }}>
            <FileText className="h-4 w-4" />
            PDF
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
            const data = buildExportData();
            exportToPPTX(data);
          }}>
            <Presentation className="h-4 w-4" />
            PPT
          </Button>
        </div>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('customerSummary.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <option value="">{t('customerSummary.allClassifications')}</option>
          {classifications.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-caption">
                <th className="whitespace-nowrap px-4 py-3 text-left">
                  <SortHeader label={t('customerSummary.account')} field="account" />
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-left">
                  <SortHeader label={t('customerSummary.customerName')} field="name" />
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-left">
                  <SortHeader label={t('customerSummary.classification')} field="classification" />
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-right">
                  <SortHeader label={t('customerSummary.campaigns')} field="campaignCount" />
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-right">
                  <SortHeader label={t('customerSummary.totalSpend')} field="totalSpend" />
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-right">
                  <SortHeader label={t('customerSummary.roshenShare')} field="roshenShare" />
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-right">
                  <SortHeader label={t('customerSummary.distributorShare')} field="distributorShare" />
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-right">
                  <SortHeader label={t('customerSummary.salesBefore')} field="salesBefore" />
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-right">
                  <SortHeader label={t('customerSummary.salesAfter')} field="salesAfter" />
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-right">
                  <SortHeader label={t('customerSummary.uplift')} field="uplift" />
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-right">
                  <SortHeader label={t('customerSummary.roiTotal')} field="roiTotal" />
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-right border-x-2 border-gold/30 bg-gold/5">
                  <SortHeader label={t('customerSummary.roiRoshen')} field="roiRoshen" />
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-right">
                  <SortHeader label={t('customerSummary.spendToSales')} field="spendToSales" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((row) => (
                <tr
                  key={row.account}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(`/trade-spend/customers/${row.account}`)}
                >
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                    {row.account}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium">
                    {row.name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {row.classification ? (
                      <Badge variant="secondary">{row.classification}</Badge>
                    ) : (
                      <span className="text-muted-foreground">--</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    {row.campaignCount}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    {formatSAR(row.totalSpend)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    {formatSAR(row.roshenShare)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    {formatSAR(row.distributorShare)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    {formatSAR(row.salesBefore)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    {formatSAR(row.salesAfter)}
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 text-right tabular-nums font-medium ${valueColorClass(row.uplift)}`}
                  >
                    {formatSAR(row.uplift)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    {formatPct(row.roiTotal)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-semibold border-x-2 border-gold/30 bg-gold/5 text-amber-700 dark:text-amber-400">
                    {formatPct(row.roiRoshen)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    {formatPct(row.spendToSales)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {sorted.length === 0 && (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            {t('customerSummary.noResults')}
          </div>
        )}
      </Card>
    </div>
  );
}
