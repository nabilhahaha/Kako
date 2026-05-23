import { useMemo, useState, useCallback } from 'react';
import type { SalesDataset } from '@/lib/salesTypes';
import { formatSAR, formatNumber } from '@/lib/salesDataUtils';
import { exportTableToExcel } from '@/lib/excelExport';

interface Props {
  dataset: SalesDataset;
  indices: Uint32Array;
}

interface CustomerAgg {
  name: string;
  acct: string;
  channel: string;
  branch: string;
  sales: number;
  returns: number;
  qty: number;
  orders: number;
}

export function CustomersTab({ dataset, indices }: Props) {
  const [sortBy, setSortBy] = useState<'sales' | 'orders' | 'qty'>('sales');
  const [showCount, setShowCount] = useState(50);

  const customers = useMemo(() => {
    const { data, customers: custs, dims } = dataset;
    const map = new Map<number, CustomerAgg>();

    for (const i of indices) {
      const cuIdx = data.cu[i];
      const isReturn = data.r[i] === 1;

      if (!map.has(cuIdx)) {
        const cu = custs[cuIdx];
        map.set(cuIdx, {
          name: cu.n,
          acct: cu.acct,
          channel: dims.channels[cu.ch] ?? '',
          branch: dims.branches[cu.br] ?? '',
          sales: 0, returns: 0, qty: 0, orders: 0,
        });
      }

      const agg = map.get(cuIdx)!;
      if (isReturn) {
        agg.returns += Math.abs(data.s[i]);
      } else {
        agg.sales += data.s[i];
        agg.orders++;
      }
      agg.qty += data.q[i];
    }

    return [...map.values()].sort((a, b) => b[sortBy] - a[sortBy]);
  }, [dataset, indices, sortBy]);

  const totalSales = customers.reduce((s, c) => s + c.sales, 0);
  const visible = customers.slice(0, showCount);

  const handleExport = useCallback(() => {
    const headers = ['#', 'Customer', 'Account', 'Channel', 'Branch', 'Sales (SAR)', 'Returns (SAR)', 'Qty', 'Orders'];
    const rows = customers.map((c, idx) => [
      idx + 1, c.name, c.acct, c.channel, c.branch,
      Math.round(c.sales * 100) / 100,
      Math.round(c.returns * 100) / 100,
      c.qty, c.orders,
    ]);
    exportTableToExcel(headers, rows, 'Roshen_Customers');
  }, [customers]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-muted-foreground">
          👥 {formatNumber(customers.length)} active customers
        </span>
        <div className="flex gap-1">
          {(['sales', 'orders', 'qty'] as const).map((key) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                sortBy === key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              Sort by {key === 'sales' ? 'Revenue' : key === 'orders' ? 'Orders' : 'Quantity'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-sm font-bold">📋 Customer List</h3>
          <button onClick={handleExport} className="dash-btn-ghost !h-7 !px-2.5 !text-[11px]">📥 Export</button>
        </div>
        <div className="overflow-x-auto">
          <table className="dash-table">
            <thead>
              <tr>
                <th className="text-start font-semibold w-10">#</th>
                <th className="text-start font-semibold">Customer</th>
                <th className="text-start font-semibold">Channel</th>
                <th className="text-start font-semibold">Branch</th>
                <th className="text-end font-semibold">Sales (SAR)</th>
                <th className="text-end font-semibold">Share</th>
                <th className="text-end font-semibold">Returns</th>
                <th className="text-end font-semibold">Qty</th>
                <th className="text-end font-semibold">Orders</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c, idx) => (
                <tr key={c.acct} className="">
                  <td className="text-muted-foreground">{idx + 1}</td>
                  <td className="">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-[10px] text-muted-foreground">{c.acct}</div>
                  </td>
                  <td className="text-xs">{c.channel}</td>
                  <td className="text-xs">{c.branch}</td>
                  <td className="num pos">{formatSAR(c.sales)}</td>
                  <td className="text-end">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${Math.min((c.sales / totalSales) * 100 * 10, 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground w-10 text-end">
                        {((c.sales / totalSales) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="num neg">
                    {c.returns > 0 ? formatSAR(c.returns) : '—'}
                  </td>
                  <td className="num">{formatNumber(c.qty)}</td>
                  <td className="text-end">{c.orders}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {customers.length > showCount && (
          <div className="p-3 border-t text-center">
            <button
              onClick={() => setShowCount((c) => c + 50)}
              className="px-4 py-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
            >
              Show more ({customers.length - showCount} remaining)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
