import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { SalesDataset } from '@/lib/salesTypes';
import { formatSAR, formatNumber } from '@/lib/salesDataUtils';

const sarFmt = (v: unknown) => [formatSAR(Number(v)), 'Sales'];

interface Props { dataset: SalesDataset; indices: Uint32Array }

type ProfileType = 'salesman' | 'customer' | 'product';

export function ProfilesTab({ dataset, indices }: Props) {
  const [profileType, setProfileType] = useState<ProfileType>('salesman');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const list = useMemo(() => {
    if (profileType === 'salesman') {
      const sales = new Map<number, number>();
      for (const i of indices) { if (dataset.data.r[i] === 0) sales.set(dataset.data.sm[i], (sales.get(dataset.data.sm[i]) || 0) + dataset.data.s[i]); }
      return dataset.salesmen.map(s => ({ id: s.id, name: s.n, sales: sales.get(s.id) || 0 }))
        .filter(s => s.sales > 0).sort((a, b) => b.sales - a.sales);
    }
    if (profileType === 'customer') {
      const sales = new Map<number, number>();
      for (const i of indices) { if (dataset.data.r[i] === 0) sales.set(dataset.data.cu[i], (sales.get(dataset.data.cu[i]) || 0) + dataset.data.s[i]); }
      return dataset.customers.map(c => ({ id: c.id, name: c.n, sales: sales.get(c.id) || 0 }))
        .filter(c => c.sales > 0).sort((a, b) => b.sales - a.sales);
    }
    const sales = new Map<number, number>();
    for (const i of indices) { if (dataset.data.r[i] === 0) sales.set(dataset.data.sk[i], (sales.get(dataset.data.sk[i]) || 0) + dataset.data.s[i]); }
    return dataset.skus.map(s => ({ id: s.id, name: s.d, sales: sales.get(s.id) || 0 }))
      .filter(s => s.sales > 0).sort((a, b) => b.sales - a.sales);
  }, [dataset, indices, profileType]);

  const filtered = search ? list.filter(l => l.name.toLowerCase().includes(search.toLowerCase())) : list;

  const profile = useMemo(() => {
    if (selectedId === null) return null;
    const { data, meta, customers, skus, salesmen, dims } = dataset;
    const matchFn = profileType === 'salesman' ? (i: number) => data.sm[i] === selectedId
      : profileType === 'customer' ? (i: number) => data.cu[i] === selectedId
      : (i: number) => data.sk[i] === selectedId;

    let totalSales = 0, totalReturns = 0, totalQty = 0, totalDiscount = 0;
    const monthSales = new Map<number, number>();
    const bySKU = new Map<number, { name: string; cat: string; sales: number; qty: number }>();
    const byCust = new Map<number, { name: string; ch: string; sales: number; qty: number }>();
    const bySm = new Map<number, { name: string; sales: number }>();

    for (const i of indices) {
      if (!matchFn(i)) continue;
      const s = data.s[i];
      if (data.r[i] === 1) { totalReturns += Math.abs(s); continue; }
      totalSales += s; totalQty += data.q[i]; totalDiscount += Math.abs(data.di[i]);
      monthSales.set(data.m[i], (monthSales.get(data.m[i]) || 0) + s);

      const sk = data.sk[i];
      if (!bySKU.has(sk)) bySKU.set(sk, { name: skus[sk].d, cat: dims.categories[skus[sk].c] ?? '', sales: 0, qty: 0 });
      const skObj = bySKU.get(sk)!; skObj.sales += s; skObj.qty += data.q[i];

      const cu = data.cu[i];
      if (!byCust.has(cu)) byCust.set(cu, { name: customers[cu].n, ch: dims.channels[customers[cu].ch] ?? '', sales: 0, qty: 0 });
      const cuObj = byCust.get(cu)!; cuObj.sales += s; cuObj.qty += data.q[i];

      const sm = data.sm[i];
      if (!bySm.has(sm)) bySm.set(sm, { name: salesmen[sm].n, sales: 0 });
      bySm.get(sm)!.sales += s;
    }

    const monthlyData = meta.months.map((month, idx) => {
      const [, mo] = month.split('-');
      const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return { label: names[parseInt(mo)-1], sales: monthSales.get(idx) || 0 };
    });

    const topSKUs = [...bySKU.values()].sort((a, b) => b.sales - a.sales).slice(0, 15);
    const topCustomers = [...byCust.values()].sort((a, b) => b.sales - a.sales).slice(0, 15);
    const topSalesmen = [...bySm.values()].sort((a, b) => b.sales - a.sales).slice(0, 10);

    const name = profileType === 'salesman' ? salesmen[selectedId]?.n
      : profileType === 'customer' ? customers[selectedId]?.n
      : skus[selectedId]?.d;

    return { name, totalSales, totalReturns, totalQty, totalDiscount, monthlyData, topSKUs, topCustomers, topSalesmen };
  }, [dataset, indices, selectedId, profileType]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(['salesman', 'customer', 'product'] as const).map(t => (
          <button key={t} onClick={() => { setProfileType(t); setSelectedId(null); setSearch(''); }}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
              profileType === t ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}>
            {t === 'salesman' ? '👤 Salesman' : t === 'customer' ? '👥 Customer' : '🍫 Product'} 360°
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl border overflow-hidden">
          <div className="p-3 border-b">
            <input type="text" placeholder={`Search ${profileType}...`} value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded-lg bg-background" />
          </div>
          <div className="overflow-y-auto max-h-[600px]">
            {filtered.slice(0, 100).map(item => (
              <button key={item.id} onClick={() => setSelectedId(item.id)}
                className={`w-full text-start px-4 py-2.5 border-b text-sm hover:bg-muted/50 transition-colors ${
                  selectedId === item.id ? 'bg-primary/10 border-s-2 border-s-primary' : ''
                }`}>
                <div className="font-medium truncate">{item.name}</div>
                <div className="text-xs text-muted-foreground">{formatSAR(item.sales)}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {!profile ? (
            <div className="bg-card rounded-xl border p-12 text-center text-muted-foreground">
              <div className="text-4xl mb-3">🔍</div>
              <p>Select a {profileType} from the list to see their full profile</p>
            </div>
          ) : (
            <>
              <div className="bg-card rounded-xl border p-4">
                <h2 className="text-lg font-bold mb-3">{profile.name}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div><div className="text-xs text-muted-foreground">Sales</div><div className="font-bold text-emerald-600">{formatSAR(profile.totalSales)}</div></div>
                  <div><div className="text-xs text-muted-foreground">Returns</div><div className="font-bold text-red-500">{formatSAR(profile.totalReturns)}</div></div>
                  <div><div className="text-xs text-muted-foreground">Qty</div><div className="font-bold">{formatNumber(profile.totalQty)}</div></div>
                  <div><div className="text-xs text-muted-foreground">Discount</div><div className="font-bold text-orange-500">{formatSAR(profile.totalDiscount)}</div></div>
                </div>
              </div>

              <div className="bg-card rounded-xl border p-4">
                <h3 className="text-sm font-bold mb-3">📈 Monthly Trend</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={profile.monthlyData}>
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={(v: number) => `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={sarFmt} contentStyle={{ borderRadius: 8 }} />
                      <Bar dataKey="sales" fill="#10B981" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {profileType !== 'product' && profile.topSKUs.length > 0 && (
                <div className="bg-card rounded-xl border overflow-hidden">
                  <div className="p-3 border-b"><h3 className="text-sm font-bold">🍫 Top SKUs</h3></div>
                  <table className="w-full text-sm">
                    <thead><tr className="bg-muted/50">
                      <th className="text-start px-3 py-1.5 text-xs font-semibold">SKU</th>
                      <th className="text-start px-3 py-1.5 text-xs font-semibold">Category</th>
                      <th className="text-end px-3 py-1.5 text-xs font-semibold">Sales</th>
                      <th className="text-end px-3 py-1.5 text-xs font-semibold">Qty</th>
                    </tr></thead>
                    <tbody>{profile.topSKUs.map((s, i) => (
                      <tr key={i} className="border-t"><td className="px-3 py-1.5 truncate max-w-[200px]">{s.name}</td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">{s.cat}</td>
                        <td className="px-3 py-1.5 text-end font-mono text-emerald-600">{formatSAR(s.sales)}</td>
                        <td className="px-3 py-1.5 text-end">{formatNumber(s.qty)}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              )}

              {profileType !== 'customer' && profile.topCustomers.length > 0 && (
                <div className="bg-card rounded-xl border overflow-hidden">
                  <div className="p-3 border-b"><h3 className="text-sm font-bold">👥 Top Customers</h3></div>
                  <table className="w-full text-sm">
                    <thead><tr className="bg-muted/50">
                      <th className="text-start px-3 py-1.5 text-xs font-semibold">Customer</th>
                      <th className="text-start px-3 py-1.5 text-xs font-semibold">Channel</th>
                      <th className="text-end px-3 py-1.5 text-xs font-semibold">Sales</th>
                      <th className="text-end px-3 py-1.5 text-xs font-semibold">Qty</th>
                    </tr></thead>
                    <tbody>{profile.topCustomers.map((c, i) => (
                      <tr key={i} className="border-t"><td className="px-3 py-1.5 truncate max-w-[200px]">{c.name}</td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">{c.ch}</td>
                        <td className="px-3 py-1.5 text-end font-mono text-emerald-600">{formatSAR(c.sales)}</td>
                        <td className="px-3 py-1.5 text-end">{formatNumber(c.qty)}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              )}

              {profileType === 'customer' && profile.topSalesmen.length > 0 && (
                <div className="bg-card rounded-xl border overflow-hidden">
                  <div className="p-3 border-b"><h3 className="text-sm font-bold">👤 Salesmen</h3></div>
                  <table className="w-full text-sm">
                    <thead><tr className="bg-muted/50">
                      <th className="text-start px-3 py-1.5 text-xs font-semibold">Salesman</th>
                      <th className="text-end px-3 py-1.5 text-xs font-semibold">Sales</th>
                    </tr></thead>
                    <tbody>{profile.topSalesmen.map((s, i) => (
                      <tr key={i} className="border-t"><td className="px-3 py-1.5">{s.name}</td>
                        <td className="px-3 py-1.5 text-end font-mono text-emerald-600">{formatSAR(s.sales)}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
