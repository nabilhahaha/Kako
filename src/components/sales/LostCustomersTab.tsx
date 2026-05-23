import { useMemo, useState } from 'react';
import type { SalesDataset } from '@/lib/salesTypes';
import { formatSAR, formatNumber, stringToDayIndex } from '@/lib/salesDataUtils';

interface Props { dataset: SalesDataset }

interface LostCustomer {
  name: string; acct: string; channel: string; branch: string; salesman: string;
  lastDate: string; daysInactive: number; totalSales: number; totalQty: number;
  risk: 'critical' | 'high' | 'medium';
}

export function LostCustomersTab({ dataset }: Props) {
  const [threshold, setThreshold] = useState(90);

  const analysis = useMemo(() => {
    const { customers, dims, salesmen, meta } = dataset;
    const refDay = stringToDayIndex(meta.dateMax);
    const lost: LostCustomer[] = [];

    for (const cu of customers) {
      const lastDay = stringToDayIndex(cu.last);
      const daysInactive = refDay - lastDay;
      if (daysInactive < threshold) continue;

      const risk: 'critical' | 'high' | 'medium' =
        daysInactive >= 180 ? 'critical' : daysInactive >= 120 ? 'high' : 'medium';

      lost.push({
        name: cu.n, acct: cu.acct,
        channel: dims.channels[cu.ch] ?? '',
        branch: dims.branches[cu.br] ?? '',
        salesman: cu.sm >= 0 ? salesmen[cu.sm]?.n ?? '' : '',
        lastDate: cu.last, daysInactive, totalSales: cu.ts, totalQty: cu.tq, risk,
      });
    }

    lost.sort((a, b) => b.totalSales - a.totalSales);

    const critical = lost.filter(c => c.risk === 'critical');
    const high = lost.filter(c => c.risk === 'high');
    const recoverable = lost.filter(c => c.daysInactive < 180);
    const totalRev = lost.reduce((s, c) => s + c.totalSales, 0);
    const avgDays = lost.length > 0 ? Math.round(lost.reduce((s, c) => s + c.daysInactive, 0) / lost.length) : 0;

    return { lost, critical, high, recoverable, totalRev, avgDays };
  }, [dataset, threshold]);

  const riskBadge = (r: string) =>
    r === 'critical' ? '🔴' : r === 'high' ? '🟠' : '🟡';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-sm font-medium">Inactive threshold:</span>
        {[60, 90, 120, 180].map(d => (
          <button key={d} onClick={() => setThreshold(d)}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
              threshold === d ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}>
            {d} days
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card rounded-xl border p-4">
          <div className="text-xs text-muted-foreground">🎯 Lost Customers</div>
          <div className="text-lg font-bold text-red-500">{formatNumber(analysis.lost.length)}</div>
        </div>
        <div className="bg-card rounded-xl border p-4">
          <div className="text-xs text-muted-foreground">💰 Historical Revenue</div>
          <div className="text-lg font-bold">{formatSAR(analysis.totalRev)}</div>
        </div>
        <div className="bg-card rounded-xl border p-4">
          <div className="text-xs text-muted-foreground">🔴 Critical ({'>'}180d)</div>
          <div className="text-lg font-bold text-red-600">{analysis.critical.length}</div>
        </div>
        <div className="bg-card rounded-xl border p-4">
          <div className="text-xs text-muted-foreground">🟢 Recoverable ({'<'}180d)</div>
          <div className="text-lg font-bold text-green-600">{analysis.recoverable.length}</div>
        </div>
      </div>

      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-sm font-bold">👥 Lost Customers (top 500 by revenue)</h3>
          <span className="text-xs text-muted-foreground">Avg {analysis.avgDays} days inactive</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-muted/50">
              <th className="text-start px-4 py-2 font-semibold">#</th>
              <th className="text-start px-4 py-2 font-semibold">Risk</th>
              <th className="text-start px-4 py-2 font-semibold">Customer</th>
              <th className="text-start px-4 py-2 font-semibold">Branch</th>
              <th className="text-start px-4 py-2 font-semibold">Salesman</th>
              <th className="text-end px-4 py-2 font-semibold">Last Order</th>
              <th className="text-end px-4 py-2 font-semibold">Days</th>
              <th className="text-end px-4 py-2 font-semibold">Revenue</th>
            </tr></thead>
            <tbody>
              {analysis.lost.slice(0, 500).map((c, idx) => (
                <tr key={c.acct} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-2 text-muted-foreground">{idx + 1}</td>
                  <td className="px-4 py-2">{riskBadge(c.risk)}</td>
                  <td className="px-4 py-2">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-[10px] text-muted-foreground">{c.channel}</div>
                  </td>
                  <td className="px-4 py-2 text-xs">{c.branch}</td>
                  <td className="px-4 py-2 text-xs">{c.salesman}</td>
                  <td className="px-4 py-2 text-end text-xs">{c.lastDate}</td>
                  <td className="px-4 py-2 text-end font-bold text-red-500">{c.daysInactive}</td>
                  <td className="px-4 py-2 text-end font-mono">{formatSAR(c.totalSales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
