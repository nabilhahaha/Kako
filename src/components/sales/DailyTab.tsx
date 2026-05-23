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
  totalVisits: number;
  activeDays: number;
  dailySales: Map<number, number>;
  dailyVisits: Map<number, number>;
}

export function DailyTab({ dataset, indices }: Props) {
  const months = dataset.meta.months;
  const [selectedMonth, setSelectedMonth] = useState(months[months.length - 1] ?? '');
  const [viewMode, setViewMode] = useState<'sales' | 'visits'>('visits');

  const analysis = useMemo(() => {
    if (!selectedMonth) return { salesmen: [] as SalesmanDaily[], daysInMonth: 0, totalSales: 0, totalVisits: 0, activeSalesmen: 0, avgDailySales: 0, coverage: 0 };

    const { data, salesmen } = dataset;
    const monthIdx = months.indexOf(selectedMonth);
    if (monthIdx < 0) return { salesmen: [] as SalesmanDaily[], daysInMonth: 0, totalSales: 0, totalVisits: 0, activeSalesmen: 0, avgDailySales: 0, coverage: 0 };

    const [yearStr, moStr] = selectedMonth.split('-');
    const daysInMonth = new Date(parseInt(yearStr), parseInt(moStr), 0).getDate();

    const smSales = new Map<number, Map<number, number>>();
    const smVisits = new Map<number, Map<number, Set<number>>>();

    for (const i of indices) {
      if (data.m[i] !== monthIdx) continue;
      if (data.r[i] === 1) continue;

      const smIdx = data.sm[i];
      const dateStr = dayIndexToString(data.d[i]);
      const dom = parseInt(dateStr.split('-')[2]);
      const sales = data.s[i];
      const cuIdx = data.cu[i];

      if (!smSales.has(smIdx)) smSales.set(smIdx, new Map());
      const dayMap = smSales.get(smIdx)!;
      dayMap.set(dom, (dayMap.get(dom) ?? 0) + sales);

      if (!smVisits.has(smIdx)) smVisits.set(smIdx, new Map());
      const visitMap = smVisits.get(smIdx)!;
      if (!visitMap.has(dom)) visitMap.set(dom, new Set());
      visitMap.get(dom)!.add(cuIdx);
    }

    const result: SalesmanDaily[] = [];
    let totalSalesAll = 0, totalVisitsAll = 0, totalActiveDays = 0;

    for (const [smIdx, dayMap] of smSales) {
      let totalSales = 0, totalVisits = 0;
      const dailyVisitCounts = new Map<number, number>();
      for (const [, s] of dayMap) { totalSales += s; }
      const visitData = smVisits.get(smIdx);
      if (visitData) {
        for (const [dom, custs] of visitData) {
          dailyVisitCounts.set(dom, custs.size);
          totalVisits += custs.size;
        }
      }
      const activeDays = dayMap.size;
      result.push({
        name: salesmen[smIdx]?.n ?? `SM ${smIdx}`,
        salesmanIdx: smIdx,
        totalSales, totalVisits, activeDays,
        dailySales: dayMap,
        dailyVisits: dailyVisitCounts,
      });
      totalSalesAll += totalSales;
      totalVisitsAll += totalVisits;
      totalActiveDays += activeDays;
    }

    result.sort((a, b) => b.totalSales - a.totalSales);
    const totalPossible = result.length * daysInMonth;

    return {
      salesmen: result, daysInMonth, totalSales: totalSalesAll, totalVisits: totalVisitsAll,
      activeSalesmen: result.length,
      avgDailySales: totalActiveDays > 0 ? totalSalesAll / totalActiveDays : 0,
      coverage: totalPossible > 0 ? (totalActiveDays / totalPossible) * 100 : 0,
    };
  }, [dataset, indices, selectedMonth, months]);

  const maxVal = useMemo(() => {
    let max = 0;
    for (const sm of analysis.salesmen) {
      const map = viewMode === 'sales' ? sm.dailySales : sm.dailyVisits;
      for (const v of map.values()) { if (v > max) max = v; }
    }
    return max;
  }, [analysis.salesmen, viewMode]);

  function cellStyle(val: number | undefined) {
    if (!val || val <= 0) return { bg: 'bg-muted/20', text: '' };
    const pct = maxVal > 0 ? val / maxVal : 0;
    const display = viewMode === 'sales' ? `${(val / 1000).toFixed(0)}K` : String(val);
    if (pct > 0.75) return { bg: 'bg-emerald-600 text-white', text: display };
    if (pct > 0.5) return { bg: 'bg-emerald-500 text-white', text: display };
    if (pct > 0.25) return { bg: 'bg-emerald-400 dark:bg-emerald-700 text-emerald-950 dark:text-emerald-100', text: display };
    if (pct > 0.05) return { bg: 'bg-emerald-200 dark:bg-emerald-800/50 text-emerald-800 dark:text-emerald-200', text: display };
    return { bg: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300', text: display };
  }

  const days = Array.from({ length: analysis.daysInMonth }, (_, i) => i + 1);

  return (
    <div className="space-y-3">
      <div className="dash-card p-3 flex items-center gap-3 flex-wrap">
        <label className="text-[12px] font-semibold text-muted-foreground">Month:</label>
        <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
          className="px-2.5 py-1.5 border rounded-md bg-background text-[13px] font-medium">
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <div className="w-px h-4 bg-border" />
        <div className="flex gap-0.5">
          {(['visits', 'sales'] as const).map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                viewMode === mode ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}>
              {mode === 'visits' ? 'Visit Count' : 'Sales Value'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Active Salesmen', value: formatNumber(analysis.activeSalesmen), color: '' },
          { label: 'Total Sales', value: formatSAR(analysis.totalSales), color: 'text-emerald-600' },
          { label: 'Total Visits', value: formatNumber(analysis.totalVisits), color: 'text-blue-600' },
          { label: 'Avg Daily Sales', value: formatSAR(analysis.avgDailySales), color: '' },
          { label: 'Coverage', value: `${analysis.coverage.toFixed(1)}%`, color: '' },
        ].map(kpi => (
          <div key={kpi.label} className="dash-card p-3">
            <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{kpi.label}</div>
            <div className={`text-[16px] font-extrabold mt-0.5 ${kpi.color}`}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {analysis.salesmen.length > 0 ? (
        <div className="dash-card overflow-hidden">
          <div className="p-3 border-b">
            <h3 className="text-[13px] font-semibold">Daily Performance Matrix — {selectedMonth}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {viewMode === 'visits' ? 'Cell = unique customers visited' : 'Cell = sales in K SAR'}. Darker green = higher value.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="border-collapse" style={{ fontSize: 10 }}>
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-muted/80 backdrop-blur-sm text-left px-3 py-2 font-semibold text-muted-foreground min-w-[130px] text-[10px] uppercase tracking-wider">
                    Salesman
                  </th>
                  {days.map(d => (
                    <th key={d} className="px-0 py-2 text-center font-semibold text-muted-foreground" style={{ width: 28, minWidth: 28 }}>
                      {d}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right font-semibold text-muted-foreground min-w-[70px] text-[10px] uppercase tracking-wider">Total</th>
                  <th className="px-2 py-2 text-right font-semibold text-muted-foreground min-w-[40px] text-[10px] uppercase tracking-wider">Days</th>
                </tr>
              </thead>
              <tbody>
                {analysis.salesmen.map(sm => {
                  const map = viewMode === 'sales' ? sm.dailySales : sm.dailyVisits;
                  return (
                    <tr key={sm.salesmanIdx} className="border-t border-border/20">
                      <td className="sticky left-0 z-10 bg-card px-3 py-0.5 font-medium truncate max-w-[130px]" style={{ fontSize: 11 }}>
                        {sm.name}
                      </td>
                      {days.map(d => {
                        const val = map.get(d);
                        const { bg, text } = cellStyle(val);
                        return (
                          <td key={d} className="p-px">
                            <div
                              className={`flex items-center justify-center rounded-[3px] font-semibold ${bg}`}
                              style={{ width: 26, height: 24, fontSize: 8 }}
                              title={`Day ${d}: ${val != null ? (viewMode === 'sales' ? formatSAR(val) : `${val} visits`) : 'No activity'}`}
                            >
                              {text}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-2 py-0.5 text-right font-mono font-semibold text-emerald-600" style={{ fontSize: 11 }}>
                        {viewMode === 'sales' ? formatSAR(sm.totalSales) : formatNumber(sm.totalVisits)}
                      </td>
                      <td className="px-2 py-0.5 text-right font-mono" style={{ fontSize: 11 }}>
                        {sm.activeDays}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="dash-card p-8 text-center text-muted-foreground">
          No sales data for {selectedMonth}.
        </div>
      )}
    </div>
  );
}
