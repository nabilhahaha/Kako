import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import type { ProductSales } from '@/lib/salesTypes';
import { formatSAR, formatNumber } from '@/lib/salesDataUtils';

const sarFormatter = (value: unknown) => [formatSAR(Number(value)), 'Sales'];

const COLORS = ['#DC2626', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316', '#84CC16', '#14B8A6'];

interface Props {
  productSales: ProductSales[];
}

export function ProductsTab({ productSales }: Props) {
  const top15 = productSales.slice(0, 15);
  const totalSales = productSales.reduce((sum, p) => sum + p.sales, 0);

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border p-4">
        <h3 className="text-sm font-bold text-foreground mb-3">🍫 Sales by Category (Top 15)</h3>
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={top15} layout="vertical">
              <XAxis
                type="number"
                tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
                tick={{ fontSize: 11 }}
              />
              <YAxis type="category" dataKey="category" tick={{ fontSize: 10 }} width={140} />
              <Tooltip
                formatter={sarFormatter}
                contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Bar dataKey="sales" radius={[0, 4, 4, 0]}>
                {top15.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="text-sm font-bold text-foreground">📋 All Categories</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-start px-4 py-2 font-semibold">#</th>
                <th className="text-start px-4 py-2 font-semibold">Category</th>
                <th className="text-end px-4 py-2 font-semibold">Sales (SAR)</th>
                <th className="text-end px-4 py-2 font-semibold">Share</th>
                <th className="text-end px-4 py-2 font-semibold">Qty</th>
                <th className="text-end px-4 py-2 font-semibold">SKUs</th>
              </tr>
            </thead>
            <tbody>
              {productSales.map((p, idx) => (
                <tr key={p.category} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-2 text-muted-foreground">{idx + 1}</td>
                  <td className="px-4 py-2 font-medium">{p.category}</td>
                  <td className="px-4 py-2 text-end font-mono">{formatSAR(p.sales)}</td>
                  <td className="px-4 py-2 text-end">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${(p.sales / totalSales) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {((p.sales / totalSales) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-end font-mono">{formatNumber(p.qty)}</td>
                  <td className="px-4 py-2 text-end">{p.skuCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
