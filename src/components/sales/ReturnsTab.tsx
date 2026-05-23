import { useMemo, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import type { SalesDataset } from '@/lib/salesTypes';
import { formatSAR, formatNumber, formatPercent } from '@/lib/salesDataUtils';
import { exportTableToExcel } from '@/lib/excelExport';

const COLORS = ['#EF4444', '#F59E0B', '#8B5CF6', '#3B82F6', '#10B981', '#EC4899', '#06B6D4', '#F97316'];
const sarFmt = (v: unknown) => [formatSAR(Number(v)), 'Value'];

interface Props { dataset: SalesDataset; indices: Uint32Array }

export function ReturnsTab({ dataset, indices }: Props) {
  const analysis = useMemo(() => {
    const { data, customers, skus, salesmen, dims } = dataset;
    let grossSales = 0, returnsVal = 0, returnsCases = 0, salesCases = 0;
    const byCustomer = new Map<number, { name: string; val: number; cases: number }>();
    const bySKU = new Map<number, { name: string; val: number; cases: number }>();
    const bySalesman = new Map<number, { name: string; val: number; cases: number }>();
    const byBranch = new Map<number, { name: string; val: number; cases: number }>();
    const byMonth = new Map<number, { sales: number; returns: number }>();

    for (const i of indices) {
      const isRet = data.r[i] === 1;
      const absS = Math.abs(data.s[i]);
      const absQ = Math.abs(data.q[i]);
      const m = data.m[i];

      if (!byMonth.has(m)) byMonth.set(m, { sales: 0, returns: 0 });
      const mm = byMonth.get(m)!;

      if (isRet) {
        returnsVal += absS; returnsCases += absQ;
        mm.returns += absS;

        const cuIdx = data.cu[i];
        if (!byCustomer.has(cuIdx)) byCustomer.set(cuIdx, { name: customers[cuIdx].n, val: 0, cases: 0 });
        const c = byCustomer.get(cuIdx)!; c.val += absS; c.cases += absQ;

        const skIdx = data.sk[i];
        if (!bySKU.has(skIdx)) bySKU.set(skIdx, { name: skus[skIdx].d, val: 0, cases: 0 });
        const s = bySKU.get(skIdx)!; s.val += absS; s.cases += absQ;

        const smIdx = data.sm[i];
        if (!bySalesman.has(smIdx)) bySalesman.set(smIdx, { name: salesmen[smIdx].n, val: 0, cases: 0 });
        const sm = bySalesman.get(smIdx)!; sm.val += absS; sm.cases += absQ;

        const brIdx = customers[cuIdx].br;
        if (!byBranch.has(brIdx)) byBranch.set(brIdx, { name: dims.branches[brIdx], val: 0, cases: 0 });
        const b = byBranch.get(brIdx)!; b.val += absS; b.cases += absQ;
      } else {
        grossSales += absS; salesCases += absQ;
        mm.sales += absS;
      }
    }

    const rate = grossSales + returnsVal > 0 ? (returnsVal / (grossSales + returnsVal)) * 100 : 0;
    const sort = <T extends { val: number }>(m: Map<unknown, T>) =>
      [...m.values()].sort((a, b) => b.val - a.val);

    const monthlyData = dataset.meta.months.map((month, idx) => {
      const d = byMonth.get(idx) || { sales: 0, returns: 0 };
      const r = d.sales + d.returns > 0 ? (d.returns / (d.sales + d.returns)) * 100 : 0;
      const [, mo] = month.split('-');
      const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return { label: names[parseInt(mo)-1], returns: d.returns, rate: Math.round(r * 10) / 10 };
    });

    return {
      grossSales, returnsVal, returnsCases, salesCases, rate,
      netSales: grossSales - returnsVal,
      topCustomers: sort(byCustomer).slice(0, 15),
      topSKUs: sort(bySKU).slice(0, 15),
      topSalesmen: sort(bySalesman).slice(0, 15),
      topBranches: sort(byBranch),
      monthlyData,
    };
  }, [dataset, indices]);

  const handleExportCustomers = useCallback(() => {
    const headers = ['#', 'Name', 'Value (SAR)', 'Cases', 'Share %'];
    const rows = analysis.topCustomers.map((item, idx) => [
      idx + 1, item.name,
      Math.round(item.val * 100) / 100,
      item.cases,
      analysis.returnsVal > 0 ? Math.round((item.val / analysis.returnsVal) * 1000) / 10 : 0,
    ]);
    exportTableToExcel(headers, rows, 'Roshen_Returns');
  }, [analysis.topCustomers, analysis.returnsVal]);

  const rateColor = analysis.rate > 20 ? 'text-red-600' : analysis.rate > 10 ? 'text-orange-500' : 'text-green-600';
  const rateLabel = analysis.rate > 20 ? '🔴 Critical' : analysis.rate > 10 ? '🟠 High' : '🟢 Healthy';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card rounded-xl border p-4">
          <div className="text-xs text-muted-foreground">🔁 Total Returns</div>
          <div className="text-lg font-bold text-red-500">{formatSAR(analysis.returnsVal)}</div>
        </div>
        <div className="bg-card rounded-xl border p-4">
          <div className="text-xs text-muted-foreground">📉 Return Rate</div>
          <div className={`text-lg font-bold ${rateColor}`}>{formatPercent(analysis.rate)} {rateLabel}</div>
        </div>
        <div className="bg-card rounded-xl border p-4">
          <div className="text-xs text-muted-foreground">📦 Return Cases</div>
          <div className="text-lg font-bold">{formatNumber(analysis.returnsCases)}</div>
        </div>
        <div className="bg-card rounded-xl border p-4">
          <div className="text-xs text-muted-foreground">💰 Net Sales</div>
          <div className="text-lg font-bold text-emerald-600">{formatSAR(analysis.netSales)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border p-4">
          <h3 className="text-sm font-bold mb-3">📊 Monthly Returns</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analysis.monthlyData}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v: number) => `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={sarFmt} contentStyle={{ borderRadius: 8 }} />
                <Bar dataKey="returns" fill="#EF4444" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-card rounded-xl border p-4">
          <h3 className="text-sm font-bold mb-3">🏢 Returns by Branch</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={analysis.topBranches} dataKey="val" nameKey="name" cx="50%" cy="50%" outerRadius={90}
                  label={({ percent, ...rest }) => `${(rest as Record<string,unknown>).name} ${((percent ?? 0)*100).toFixed(0)}%`}
                  labelLine={{ strokeWidth: 1 }}>
                  {analysis.topBranches.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={sarFmt} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {[
        { title: '👥 Top Return Customers', data: analysis.topCustomers, exportFn: handleExportCustomers },
        { title: '🍫 Top Return SKUs', data: analysis.topSKUs, exportFn: undefined },
        { title: '👤 Top Return Salesmen', data: analysis.topSalesmen, exportFn: undefined },
      ].map(({ title, data: items, exportFn }) => (
        <div key={title} className="bg-card rounded-xl border overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="text-sm font-bold">{title}</h3>
            {exportFn && <button onClick={exportFn} className="dash-btn-ghost !h-7 !px-2.5 !text-[11px]">📥 Export</button>}
          </div>
          <table className="w-full text-sm">
            <thead><tr className="bg-muted/50">
              <th className="text-start px-4 py-2 font-semibold">#</th>
              <th className="text-start px-4 py-2 font-semibold">Name</th>
              <th className="text-end px-4 py-2 font-semibold">Value (SAR)</th>
              <th className="text-end px-4 py-2 font-semibold">Cases</th>
              <th className="text-end px-4 py-2 font-semibold">Share</th>
            </tr></thead>
            <tbody>{items.map((item, idx) => (
              <tr key={idx} className="border-t hover:bg-muted/30">
                <td className="px-4 py-2 text-muted-foreground">{idx+1}</td>
                <td className="px-4 py-2 font-medium truncate max-w-[200px]">{item.name}</td>
                <td className="px-4 py-2 text-end font-mono text-red-500">{formatSAR(item.val)}</td>
                <td className="px-4 py-2 text-end">{formatNumber(item.cases)}</td>
                <td className="px-4 py-2 text-end text-xs">{analysis.returnsVal > 0 ? formatPercent((item.val / analysis.returnsVal) * 100) : '0%'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
