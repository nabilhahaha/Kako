import { useMemo, useState, useEffect } from 'react';
import type { StockData } from '@/lib/stockTypes';
import type { SalesDataset } from '@/lib/salesTypes';
import { formatNumber, stringToDayIndex } from '@/lib/salesDataUtils';

interface Props {
  dataset: SalesDataset;
  indices: Uint32Array;
}

function daysBetween(d1: string, d2: string): number {
  return Math.round((new Date(d2).getTime() - new Date(d1).getTime()) / 86400000);
}

export function StockReportTab({ dataset, indices }: Props) {
  const [stock, setStock] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const cached = localStorage.getItem('roshen_stock_data');
        if (cached) { setStock(JSON.parse(cached)); setLoading(false); return; }
        const res = await fetch('/data/stock-data.json');
        if (res.ok) {
          const data = await res.json();
          setStock(data);
          try { localStorage.setItem('roshen_stock_data', JSON.stringify(data)); } catch {}
        }
      } catch {} finally { setLoading(false); }
    }
    load();
  }, []);

  const dates = useMemo(() => stock ? Object.keys(stock.snapshots).sort() : [], [stock]);

  useEffect(() => {
    if (dates.length > 0 && !selectedDate) setSelectedDate(dates[dates.length - 1]);
  }, [dates, selectedDate]);

  const snapshot = useMemo(() => {
    if (!stock || !selectedDate) return [];
    return stock.snapshots[selectedDate] || [];
  }, [stock, selectedDate]);

  const sales90 = useMemo(() => {
    if (!dataset || !selectedDate) return new Map<string, number>();
    const refDay = stringToDayIndex(selectedDate);
    const start = refDay - 90;
    const map = new Map<string, number>();
    for (const i of indices) {
      if (dataset.data.d[i] < start || dataset.data.d[i] > refDay) continue;
      if (dataset.data.r[i] === 1) continue;
      const sku = dataset.skus[dataset.data.sk[i]];
      if (!sku) continue;
      map.set(sku.iid, (map.get(sku.iid) || 0) + dataset.data.q[i]);
    }
    return map;
  }, [dataset, indices, selectedDate]);

  const analysis = useMemo(() => {
    if (snapshot.length === 0) return null;
    const totalCases = snapshot.reduce((s, b) => s + b.cases, 0);
    const totalQty = snapshot.reduce((s, b) => s + b.qty, 0);
    const uniqueSkus = new Set(snapshot.map(b => b.sku)).size;
    const uniqueBatches = new Set(snapshot.map(b => b.batch)).size;
    const warehouses = [...new Set(snapshot.map(b => b.wh))].sort();

    const expired = snapshot.filter(b => b.expiry && b.expiry < selectedDate).reduce((s, b) => s + b.cases, 0);
    const buckets = [
      { label: '0-30 days', min: 0, max: 30, cases: 0, batches: 0, color: 'text-red-600', bg: 'bg-red-50' },
      { label: '31-60 days', min: 31, max: 60, cases: 0, batches: 0, color: 'text-orange-600', bg: 'bg-orange-50' },
      { label: '61-90 days', min: 61, max: 90, cases: 0, batches: 0, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    ];
    for (const b of snapshot) {
      if (!b.expiry || b.expiry < selectedDate) continue;
      const days = daysBetween(selectedDate, b.expiry);
      for (const bucket of buckets) {
        if (days >= bucket.min && days <= bucket.max) { bucket.cases += b.cases; bucket.batches++; break; }
      }
    }

    const skuWh = new Map<string, Map<string, number>>();
    for (const b of snapshot) {
      if (!skuWh.has(b.sku)) skuWh.set(b.sku, new Map());
      const whMap = skuWh.get(b.sku)!;
      whMap.set(b.wh, (whMap.get(b.wh) || 0) + b.cases);
    }
    const skuTotals = [...skuWh.entries()].map(([sku, whMap]) => {
      const total = [...whMap.values()].reduce((s, v) => s + v, 0);
      const sold90 = sales90.get(sku) || 0;
      return { sku, whMap, total, sold90 };
    }).sort((a, b) => b.sold90 - a.sold90 || b.total - a.total);

    const atRisk = skuTotals.filter(s => s.total > 0 && s.sold90 === 0);

    return { totalCases, totalQty, uniqueSkus, uniqueBatches, warehouses, expired, buckets, skuTotals, atRisk };
  }, [snapshot, selectedDate, sales90]);

  const filteredSkus = useMemo(() => {
    if (!analysis) return [];
    if (!searchQuery.trim()) return analysis.skuTotals;
    const q = searchQuery.toLowerCase();
    return analysis.skuTotals.filter(s => {
      const info = stock?.skuInfo[s.sku];
      return s.sku.toLowerCase().includes(q) || (info?.name || '').toLowerCase().includes(q) || (info?.cat || '').toLowerCase().includes(q);
    });
  }, [analysis, searchQuery, stock]);

  if (loading) return <div className="dash-card p-12 text-center text-muted-foreground">Loading stock data...</div>;

  if (!stock || dates.length === 0) {
    return (
      <div className="dash-card p-12 text-center space-y-3">
        <div className="text-4xl">📦</div>
        <p className="text-lg font-bold">No Stock Data</p>
        <p className="text-sm text-muted-foreground">Stock data will be loaded from the embedded dataset.</p>
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="dash-card p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-[15px] font-extrabold">📦 Stock Report</h2>
          <p className="text-[11px] text-muted-foreground">{dates.length} snapshots · {dates[0]} → {dates[dates.length - 1]}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[12px] font-semibold text-muted-foreground">Snapshot:</label>
          <select value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            className="px-2.5 py-1.5 border rounded-md bg-background text-[13px] font-medium">
            {dates.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total Cases', value: formatNumber(analysis.totalCases), sub: `${analysis.uniqueSkus} SKUs`, color: 'text-blue-700' },
          { label: 'Unique Batches', value: formatNumber(analysis.uniqueBatches), sub: `${analysis.warehouses.length} warehouses`, color: '' },
          { label: 'Total Units', value: formatNumber(analysis.totalQty), sub: 'Physical available', color: '' },
          { label: 'At Risk (90d)', value: formatNumber(analysis.buckets.reduce((s, b) => s + b.cases, 0)), sub: 'Cases expiring soon', color: 'text-orange-600' },
          { label: 'Expired', value: formatNumber(analysis.expired), sub: 'Past expiry date', color: analysis.expired > 0 ? 'text-red-600' : '' },
        ].map(kpi => (
          <div key={kpi.label} className="dash-card p-3">
            <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{kpi.label}</div>
            <div className={`text-[17px] font-extrabold mt-0.5 ${kpi.color}`}>{kpi.value}</div>
            <div className="text-[10px] text-muted-foreground">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Expiry Alerts */}
      <div className="dash-card p-4">
        <h3 className="text-[13px] font-semibold mb-3">⚠️ Expiry Alerts</h3>
        <div className="grid grid-cols-3 gap-3">
          {analysis.buckets.map(b => (
            <div key={b.label} className={`rounded-lg p-3 border ${b.bg}`}>
              <div className={`text-[11px] font-bold ${b.color}`}>{b.label}</div>
              <div className={`text-xl font-extrabold ${b.color}`}>{formatNumber(b.cases)} cases</div>
              <div className="text-[10px] text-muted-foreground">{b.batches} batches</div>
            </div>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="dash-card p-3">
        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search SKU code, name, or category..."
          className="dash-input" />
      </div>

      {/* SKU × Warehouse Matrix */}
      <div className="dash-card overflow-hidden">
        <div className="p-3 border-b">
          <h3 className="text-[13px] font-semibold">SKU × Warehouse Stock Matrix</h3>
          <p className="text-[11px] text-muted-foreground">Sorted by 90-day sales volume. Showing {filteredSkus.length} SKUs.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="dash-table">
            <thead><tr>
              <th className="text-start font-semibold">SKU</th>
              <th className="text-start font-semibold">Name</th>
              {analysis.warehouses.map(wh => <th key={wh} className="text-end font-semibold">{wh}</th>)}
              <th className="text-end font-semibold">Total</th>
              <th className="text-end font-semibold">90d Sales</th>
              <th className="text-end font-semibold">Status</th>
            </tr></thead>
            <tbody>
              {filteredSkus.slice(0, 100).map(s => {
                const info = stock?.skuInfo[s.sku];
                const ratio = s.total > 0 && s.sold90 > 0 ? s.sold90 / s.total : 0;
                const status = s.sold90 === 0 ? '🔴 No Sales' : ratio < 0.5 ? '🟡 Slow' : '🟢 OK';
                return (
                  <tr key={s.sku}>
                    <td className="font-mono text-[11px]">{s.sku}</td>
                    <td className="text-[11px] truncate max-w-[200px]">{info?.name || s.sku}</td>
                    {analysis.warehouses.map(wh => (
                      <td key={wh} className="num">{s.whMap.get(wh) || '—'}</td>
                    ))}
                    <td className="num font-bold">{formatNumber(s.total)}</td>
                    <td className={`num ${s.sold90 > 0 ? 'pos' : 'neg'}`}>{formatNumber(s.sold90)}</td>
                    <td className="text-end text-[11px]">{status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* At Risk */}
      {analysis.atRisk.length > 0 && (
        <div className="dash-card overflow-hidden">
          <div className="p-3 border-b">
            <h3 className="text-[13px] font-semibold text-red-600">🔴 At-Risk SKUs (Zero 90-Day Sales)</h3>
            <p className="text-[11px] text-muted-foreground">{analysis.atRisk.length} SKUs with stock but no sales in last 90 days</p>
          </div>
          <div className="overflow-x-auto">
            <table className="dash-table">
              <thead><tr>
                <th className="text-start font-semibold">SKU</th>
                <th className="text-start font-semibold">Name</th>
                <th className="text-start font-semibold">Category</th>
                <th className="text-end font-semibold">Stock (Cases)</th>
              </tr></thead>
              <tbody>
                {analysis.atRisk.map(s => {
                  const info = stock?.skuInfo[s.sku];
                  return (
                    <tr key={s.sku}>
                      <td className="font-mono text-[11px]">{s.sku}</td>
                      <td className="text-[11px]">{info?.name || s.sku}</td>
                      <td className="text-[11px] text-muted-foreground">{info?.cat || '—'}</td>
                      <td className="num neg font-bold">{formatNumber(s.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
