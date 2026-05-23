import { useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { SalesmanPerformance } from '@/lib/salesTypes';
import { formatSAR, formatNumber } from '@/lib/salesDataUtils';
import { exportTableToExcel } from '@/lib/excelExport';

const sarFormatter = (value: unknown) => [formatSAR(Number(value)), 'Sales'];

interface Props {
  salesmanPerformance: SalesmanPerformance[];
}

export function SalesTeamTab({ salesmanPerformance }: Props) {
  const top20 = salesmanPerformance.slice(0, 20);

  const handleExport = useCallback(() => {
    const headers = ['#', 'Salesman', 'Sales (SAR)', 'Qty', 'Customers', 'Orders', 'Avg Order'];
    const rows = salesmanPerformance.map((sm, idx) => [
      idx + 1, sm.name,
      Math.round(sm.sales * 100) / 100,
      sm.qty, sm.customers, sm.invoices,
      Math.round(sm.avgOrderValue * 100) / 100,
    ]);
    exportTableToExcel(headers, rows, 'Roshen_SalesTeam');
  }, [salesmanPerformance]);

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border p-4">
        <h3 className="text-sm font-bold text-foreground mb-3">👤 Top 20 Salesmen by Revenue</h3>
        <div className="h-[500px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={top20} layout="vertical">
              <XAxis
                type="number"
                tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
                tick={{ fontSize: 11 }}
              />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={160} />
              <Tooltip
                formatter={sarFormatter}
                contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Bar dataKey="sales" fill="#3B82F6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">📋 Full Sales Team</h3>
          <button onClick={handleExport} className="dash-btn-ghost !h-7 !px-2.5 !text-[11px]">📥 Export</button>
        </div>
        <div className="overflow-x-auto">
          <table className="dash-table">
            <thead>
              <tr>
                <th className="text-start font-semibold">#</th>
                <th className="text-start font-semibold">Salesman</th>
                <th className="text-end font-semibold">Sales (SAR)</th>
                <th className="text-end font-semibold">Qty</th>
                <th className="text-end font-semibold">Customers</th>
                <th className="text-end font-semibold">Orders</th>
                <th className="text-end font-semibold">Avg Order</th>
              </tr>
            </thead>
            <tbody>
              {salesmanPerformance.map((sm, idx) => (
                <tr key={sm.name} className="">
                  <td className="text-muted-foreground">{idx + 1}</td>
                  <td className="font-medium">{sm.name}</td>
                  <td className="num pos">{formatSAR(sm.sales)}</td>
                  <td className="num">{formatNumber(sm.qty)}</td>
                  <td className="text-end">{sm.customers}</td>
                  <td className="text-end">{formatNumber(sm.invoices)}</td>
                  <td className="num">{formatSAR(sm.avgOrderValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
