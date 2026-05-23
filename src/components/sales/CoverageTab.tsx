import { useMemo, useState } from 'react';
import type { SalesDataset } from '@/lib/salesTypes';
import { formatSAR, formatNumber } from '@/lib/salesDataUtils';

interface Props {
  dataset: SalesDataset;
  indices: Uint32Array;
}

type ViewMode = 'customers' | 'sales';

interface CellData {
  customers: Set<number>;
  sales: number;
}

export function CoverageTab({ dataset, indices }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('customers');

  const analysis = useMemo(() => {
    const { data, customers, dims } = dataset;
    const branches = dims.branches;
    const channels = dims.channels;

    // Build Branch x Channel matrix
    const matrix = new Map<string, CellData>();

    const branchTotals = new Map<number, CellData>();
    const channelTotals = new Map<number, CellData>();
    let grandCustomers = new Set<number>();
    let grandSales = 0;

    for (const i of indices) {
      if (data.r[i] === 1) continue; // skip returns

      const cuIdx = data.cu[i];
      const cu = customers[cuIdx];
      const brIdx = cu.br;
      const chIdx = cu.ch;
      const sales = data.s[i];

      // Cell
      const key = `${brIdx}-${chIdx}`;
      let cell = matrix.get(key);
      if (!cell) {
        cell = { customers: new Set(), sales: 0 };
        matrix.set(key, cell);
      }
      cell.customers.add(cuIdx);
      cell.sales += sales;

      // Branch total
      let brTotal = branchTotals.get(brIdx);
      if (!brTotal) {
        brTotal = { customers: new Set(), sales: 0 };
        branchTotals.set(brIdx, brTotal);
      }
      brTotal.customers.add(cuIdx);
      brTotal.sales += sales;

      // Channel total
      let chTotal = channelTotals.get(chIdx);
      if (!chTotal) {
        chTotal = { customers: new Set(), sales: 0 };
        channelTotals.set(chIdx, chTotal);
      }
      chTotal.customers.add(cuIdx);
      chTotal.sales += sales;

      // Grand total
      grandCustomers.add(cuIdx);
      grandSales += sales;
    }

    // Determine active branches and channels (those with data)
    const activeBranches = branches
      .map((name, idx) => ({ name, idx }))
      .filter((b) => branchTotals.has(b.idx))
      .sort((a, b) => (branchTotals.get(b.idx)?.sales ?? 0) - (branchTotals.get(a.idx)?.sales ?? 0));

    const activeChannels = channels
      .map((name, idx) => ({ name, idx }))
      .filter((c) => channelTotals.has(c.idx))
      .sort((a, b) => (channelTotals.get(b.idx)?.sales ?? 0) - (channelTotals.get(a.idx)?.sales ?? 0));

    // Find max values for color scaling
    let maxCustomers = 0;
    let maxSales = 0;
    for (const cell of matrix.values()) {
      if (cell.customers.size > maxCustomers) maxCustomers = cell.customers.size;
      if (cell.sales > maxSales) maxSales = cell.sales;
    }

    return {
      matrix,
      branchTotals,
      channelTotals,
      activeBranches,
      activeChannels,
      grandCustomers: grandCustomers.size,
      grandSales,
      maxCustomers,
      maxSales,
    };
  }, [dataset, indices]);

  function cellBg(value: number, maxValue: number): string {
    if (value <= 0 || maxValue <= 0) return 'bg-muted/20';
    const intensity = value / maxValue;
    if (intensity > 0.8) return 'bg-blue-700 text-white';
    if (intensity > 0.6) return 'bg-blue-600 text-white';
    if (intensity > 0.4) return 'bg-blue-500 text-white';
    if (intensity > 0.2) return 'bg-blue-300 text-blue-950 dark:bg-blue-800/60 dark:text-blue-100';
    if (intensity > 0.05) return 'bg-blue-200 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200';
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
  }

  function getCellValue(brIdx: number, chIdx: number): number {
    const cell = analysis.matrix.get(`${brIdx}-${chIdx}`);
    if (!cell) return 0;
    return viewMode === 'customers' ? cell.customers.size : cell.sales;
  }

  function formatCellValue(value: number): string {
    if (value === 0) return '-';
    return viewMode === 'customers' ? formatNumber(value) : formatSAR(value);
  }

  function getBranchTotal(brIdx: number): number {
    const t = analysis.branchTotals.get(brIdx);
    if (!t) return 0;
    return viewMode === 'customers' ? t.customers.size : t.sales;
  }

  function getChannelTotal(chIdx: number): number {
    const t = analysis.channelTotals.get(chIdx);
    if (!t) return 0;
    return viewMode === 'customers' ? t.customers.size : t.sales;
  }

  const maxValue = viewMode === 'customers' ? analysis.maxCustomers : analysis.maxSales;

  if (analysis.activeBranches.length === 0) {
    return (
      <div className="dash-card p-8 text-center text-muted-foreground">
        No coverage data available for the selected filters.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="dash-card p-4 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold text-muted-foreground">Show:</span>
        <div className="flex rounded-md border overflow-hidden">
          <button
            className={`px-4 py-1.5 text-sm font-medium transition-colors ${
              viewMode === 'customers'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background hover:bg-muted'
            }`}
            onClick={() => setViewMode('customers')}
          >
            Customers
          </button>
          <button
            className={`px-4 py-1.5 text-sm font-medium transition-colors ${
              viewMode === 'sales'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background hover:bg-muted'
            }`}
            onClick={() => setViewMode('sales')}
          >
            Sales
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="dash-card p-4">
          <div className="text-xs text-muted-foreground">Branches</div>
          <div className="text-lg font-bold">{formatNumber(analysis.activeBranches.length)}</div>
        </div>
        <div className="dash-card p-4">
          <div className="text-xs text-muted-foreground">Channels</div>
          <div className="text-lg font-bold">{formatNumber(analysis.activeChannels.length)}</div>
        </div>
        <div className="dash-card p-4">
          <div className="text-xs text-muted-foreground">Total Customers</div>
          <div className="text-lg font-bold">{formatNumber(analysis.grandCustomers)}</div>
        </div>
        <div className="dash-card p-4">
          <div className="text-xs text-muted-foreground">Total Sales</div>
          <div className="text-lg font-bold text-emerald-600">{formatSAR(analysis.grandSales)}</div>
        </div>
      </div>

      {/* Coverage Matrix */}
      <div className="dash-card overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="text-sm font-bold">
            Branch x Channel Coverage ({viewMode === 'customers' ? 'Customer Count' : 'Sales Value'})
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Color intensity reflects relative {viewMode === 'customers' ? 'customer count' : 'sales value'}.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Branch</th>
                {analysis.activeChannels.map((ch) => (
                  <th key={ch.idx} className="text-end">{ch.name}</th>
                ))}
                <th className="text-end">Total</th>
              </tr>
            </thead>
            <tbody>
              {analysis.activeBranches.map((br) => (
                <tr key={br.idx}>
                  <td className="font-medium whitespace-nowrap">{br.name}</td>
                  {analysis.activeChannels.map((ch) => {
                    const val = getCellValue(br.idx, ch.idx);
                    return (
                      <td key={ch.idx} className="!p-1">
                        <div
                          className={`px-2 py-1 rounded text-xs font-semibold text-center ${cellBg(val, maxValue)}`}
                        >
                          {formatCellValue(val)}
                        </div>
                      </td>
                    );
                  })}
                  <td className="num font-semibold">
                    {formatCellValue(getBranchTotal(br.idx))}
                  </td>
                </tr>
              ))}
              {/* Totals row */}
              <tr className="border-t-2 border-border font-semibold">
                <td className="font-bold">Total</td>
                {analysis.activeChannels.map((ch) => (
                  <td key={ch.idx} className="num">
                    {formatCellValue(getChannelTotal(ch.idx))}
                  </td>
                ))}
                <td className="num font-bold">
                  {formatCellValue(
                    viewMode === 'customers' ? analysis.grandCustomers : analysis.grandSales
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
