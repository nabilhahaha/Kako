import { useMemo, useState } from 'react';
import type { SalesDataset } from '@/lib/salesTypes';
import { formatSAR, formatNumber, dayIndexToString } from '@/lib/salesDataUtils';

interface Props {
  dataset: SalesDataset;
  indices: Uint32Array;
}

interface SalesmanDaily {
  name: string;
  salesmanIdx: number;
  totalSales: number;
  activeDays: number;
  avgDailySales: number;
  dailySales: Map<number, number>; // day-of-month -> sales
}

export function DailyTab({ dataset, indices }: Props) {
  const months = dataset.meta.months;
  const [selectedMonth, setSelectedMonth] = useState<string>(months[months.length - 1] ?? '');

  const analysis = useMemo(() => {
    if (!selectedMonth) {
      return { salesmen: [] as SalesmanDaily[], daysInMonth: 0, totalSales: 0, activeSalesmen: 0, avgDailySales: 0, coverage: 0 };
    }

    const { data, salesmen } = dataset;
    const monthIdx = months.indexOf(selectedMonth);
    if (monthIdx < 0) {
      return { salesmen: [] as SalesmanDaily[], daysInMonth: 0, totalSales: 0, activeSalesmen: 0, avgDailySales: 0, coverage: 0 };
    }

    // Determine days in this month
    const [yearStr, moStr] = selectedMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(moStr, 10);
    const daysInMonth = new Date(year, month, 0).getDate();

    // Aggregate sales per salesman per day
    const smMap = new Map<number, Map<number, number>>(); // salesmanIdx -> (dayOfMonth -> sales)

    for (const i of indices) {
      if (data.m[i] !== monthIdx) continue;
      if (data.r[i] === 1) continue; // skip returns

      const smIdx = data.sm[i];
      const dayIdx = data.d[i];
      const dateStr = dayIndexToString(dayIdx);
      const dayOfMonth = parseInt(dateStr.split('-')[2], 10);
      const sales = data.s[i];

      let dayMap = smMap.get(smIdx);
      if (!dayMap) {
        dayMap = new Map();
        smMap.set(smIdx, dayMap);
      }
      dayMap.set(dayOfMonth, (dayMap.get(dayOfMonth) ?? 0) + sales);
    }

    // Build salesman records
    const salesmenData: SalesmanDaily[] = [];
    let totalSalesAll = 0;
    let totalActiveDaysAll = 0;

    for (const [smIdx, dayMap] of smMap) {
      let totalSales = 0;
      for (const sales of dayMap.values()) {
        totalSales += sales;
      }
      const activeDays = dayMap.size;
      salesmenData.push({
        name: salesmen[smIdx]?.n ?? `Salesman ${smIdx}`,
        salesmanIdx: smIdx,
        totalSales,
        activeDays,
        avgDailySales: activeDays > 0 ? totalSales / activeDays : 0,
        dailySales: dayMap,
      });
      totalSalesAll += totalSales;
      totalActiveDaysAll += activeDays;
    }

    salesmenData.sort((a, b) => b.totalSales - a.totalSales);

    const activeSalesmen = salesmenData.length;
    const totalPossibleDays = activeSalesmen * daysInMonth;
    const coverage = totalPossibleDays > 0 ? (totalActiveDaysAll / totalPossibleDays) * 100 : 0;

    return {
      salesmen: salesmenData,
      daysInMonth,
      totalSales: totalSalesAll,
      activeSalesmen,
      avgDailySales: totalActiveDaysAll > 0 ? totalSalesAll / totalActiveDaysAll : 0,
      coverage,
    };
  }, [dataset, indices, selectedMonth, months]);

  // Find max daily sales for color scaling
  const maxDailySales = useMemo(() => {
    let max = 0;
    for (const sm of analysis.salesmen) {
      for (const val of sm.dailySales.values()) {
        if (val > max) max = val;
      }
    }
    return max;
  }, [analysis.salesmen]);

  function cellColor(val: number | undefined): string {
    if (val === undefined || val <= 0) return 'bg-muted/30';
    const intensity = maxDailySales > 0 ? val / maxDailySales : 0;
    if (intensity > 0.8) return 'bg-emerald-700 text-white';
    if (intensity > 0.6) return 'bg-emerald-600 text-white';
    if (intensity > 0.4) return 'bg-emerald-500 text-white';
    if (intensity > 0.2) return 'bg-emerald-400 text-emerald-950';
    if (intensity > 0.05) return 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200';
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
  }

  const days = Array.from({ length: analysis.daysInMonth }, (_, i) => i + 1);

  return (
    <div className="space-y-4">
      {/* Month Selector */}
      <div className="dash-card p-4 flex items-center gap-3 flex-wrap">
        <label className="text-sm font-semibold text-muted-foreground">Select Month:</label>
        <select
          className="px-3 py-1.5 border rounded-md bg-background text-sm"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
        >
          {months.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="dash-card p-4">
          <div className="text-xs text-muted-foreground">Active Salesmen</div>
          <div className="text-lg font-bold">{formatNumber(analysis.activeSalesmen)}</div>
        </div>
        <div className="dash-card p-4">
          <div className="text-xs text-muted-foreground">Total Sales</div>
          <div className="text-lg font-bold text-emerald-600">{formatSAR(analysis.totalSales)}</div>
        </div>
        <div className="dash-card p-4">
          <div className="text-xs text-muted-foreground">Avg Daily Sales</div>
          <div className="text-lg font-bold">{formatSAR(analysis.avgDailySales)}</div>
        </div>
        <div className="dash-card p-4">
          <div className="text-xs text-muted-foreground">Coverage %</div>
          <div className="text-lg font-bold">{analysis.coverage.toFixed(1)}%</div>
        </div>
      </div>

      {/* Calendar Grid */}
      {analysis.salesmen.length > 0 && (
        <div className="dash-card overflow-hidden">
          <div className="p-4 border-b">
            <h3 className="text-sm font-bold">Daily Performance Matrix</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Rows = salesmen (sorted by total sales). Columns = days of the month.
              Cell intensity = sales amount.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-muted/80 backdrop-blur-sm text-left px-3 py-2 font-semibold text-muted-foreground text-xs min-w-[140px]">
                    Salesman
                  </th>
                  {days.map((d) => (
                    <th key={d} className="px-0 py-2 text-center font-semibold text-muted-foreground w-7 min-w-[1.75rem]">
                      {d}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground min-w-[80px]">
                    Total
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground min-w-[50px]">
                    Days
                  </th>
                </tr>
              </thead>
              <tbody>
                {analysis.salesmen.map((sm) => (
                  <tr key={sm.salesmanIdx} className="border-t border-border/30">
                    <td className="sticky left-0 z-10 bg-card px-3 py-1 font-medium truncate max-w-[140px] text-xs">
                      {sm.name}
                    </td>
                    {days.map((d) => {
                      const val = sm.dailySales.get(d);
                      return (
                        <td key={d} className="p-0">
                          <div
                            className={`w-7 h-7 flex items-center justify-center text-[9px] font-medium rounded-sm ${cellColor(val)}`}
                            title={val !== undefined ? `Day ${d}: ${formatSAR(val)}` : `Day ${d}: No sales`}
                          >
                            {val !== undefined && val > 0 ? '' : ''}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-3 py-1 text-right font-mono text-xs font-semibold">
                      {formatSAR(sm.totalSales)}
                    </td>
                    <td className="px-3 py-1 text-right font-mono text-xs">
                      {sm.activeDays}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {analysis.salesmen.length === 0 && (
        <div className="dash-card p-8 text-center text-muted-foreground">
          No sales data available for {selectedMonth}.
        </div>
      )}
    </div>
  );
}
