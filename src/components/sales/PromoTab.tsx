import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { SalesDataset } from '@/lib/salesTypes';
import { formatSAR, formatNumber, stringToDayIndex } from '@/lib/salesDataUtils';
import { DEFAULT_PROMOS, type PromoConfig } from '@/lib/defaultPromos';
import { CHART_COLORS, tooltipStyle, sarFormatter } from '@/lib/dashboardTheme';

interface Props { dataset: SalesDataset; indices: Uint32Array }

interface SmResult {
  name: string; branch: string; qualCount: number;
  totalCases: number; totalSales: number; returnsCases: number; returnsValue: number;
  compensation: number; capHit: boolean;
}

const blankConfig: PromoConfig = {
  id: '', name: 'New Promotion', description: '', icon: '🎁',
  startDate: '', endDate: '', skuKeyword: '',
  method: 'per-cust-cap', minSkus: 3, minCases: 1,
  perCustAmount: 10, capCustCount: 20, perCaseAmount: 4, minCustomers: 15,
  isDefault: false,
};

export function PromoTab({ dataset, indices }: Props) {
  const [promos] = useState<PromoConfig[]>(DEFAULT_PROMOS);
  const [activePromo, setActivePromo] = useState<PromoConfig | null>(null);
  const [customConfig, setCustomConfig] = useState<PromoConfig>(blankConfig);
  const [mode, setMode] = useState<'list' | 'edit' | 'report'>('list');

  const config = activePromo || customConfig;

  const matchingSKUs = useMemo(() => {
    if (!config.skuKeyword.trim()) return [];
    const kw = config.skuKeyword.toLowerCase();
    return dataset.skus.filter(s => s.d.toLowerCase().includes(kw));
  }, [dataset.skus, config.skuKeyword]);

  const skuIdSet = useMemo(() => new Set(matchingSKUs.map(s => s.id)), [matchingSKUs]);

  const results = useMemo(() => {
    if (mode !== 'report' || !config.startDate || !config.endDate || skuIdSet.size === 0) return null;
    const { data, salesmen, dims } = dataset;
    const startInt = stringToDayIndex(config.startDate);
    const endInt = stringToDayIndex(config.endDate);

    const smCustSku: Record<number, Record<number, Record<number, number>>> = {};
    const smCustSales: Record<number, Record<number, number>> = {};
    const smReturns: Record<number, { cases: number; value: number }> = {};

    for (const i of indices) {
      const dt = data.d[i];
      if (dt < startInt || dt > endInt) continue;
      if (!skuIdSet.has(data.sk[i])) continue;
      const smId = data.sm[i], cuId = data.cu[i], skId = data.sk[i];
      if (!smCustSku[smId]) smCustSku[smId] = {};
      if (!smCustSku[smId][cuId]) smCustSku[smId][cuId] = {};
      smCustSku[smId][cuId][skId] = (smCustSku[smId][cuId][skId] || 0) + data.q[i];
      if (!smCustSales[smId]) smCustSales[smId] = {};
      smCustSales[smId][cuId] = (smCustSales[smId][cuId] || 0) + data.s[i];
      if (data.r[i] === 1) {
        if (!smReturns[smId]) smReturns[smId] = { cases: 0, value: 0 };
        smReturns[smId].cases += Math.abs(data.q[i]);
        smReturns[smId].value += Math.abs(data.s[i]);
      }
    }

    const smResults: SmResult[] = [];
    let totalComp = 0, totalQual = 0, totalSales = 0, totalCases = 0;

    for (const smIdStr in smCustSku) {
      const smId = Number(smIdStr);
      const custData = smCustSku[smId];
      let qualCount = 0, smCases = 0, smSales = 0;
      for (const cuIdStr in custData) {
        const cuId = Number(cuIdStr);
        const skuCases = custData[cuId];
        const validSkus = Object.values(skuCases).filter(c => c >= config.minCases).length;
        smCases += Object.values(skuCases).reduce((s, v) => s + v, 0);
        smSales += smCustSales[smId]?.[cuId] || 0;
        if (validSkus >= config.minSkus) qualCount++;
      }
      if (smSales === 0 && qualCount === 0) continue;
      const sm = salesmen[smId];
      if (!sm || sm.n === 'BTB' || sm.n === 'MT') continue;

      let comp = 0, capHit = false;
      if (config.method === 'per-cust-cap') {
        const effective = Math.min(qualCount, config.capCustCount);
        comp = effective * config.perCustAmount;
        capHit = qualCount > config.capCustCount;
      } else if (config.method === 'per-case-min-cust') {
        if (qualCount >= config.minCustomers) comp = smCases * config.perCaseAmount;
      } else {
        comp = smCases * config.perCaseAmount;
      }

      const ret = smReturns[smId] || { cases: 0, value: 0 };
      smResults.push({ name: sm.n, branch: dims.branches[sm.br] ?? '', qualCount, totalCases: smCases,
        totalSales: smSales, returnsCases: ret.cases, returnsValue: ret.value, compensation: comp, capHit });
      totalComp += comp; totalQual += qualCount; totalSales += smSales; totalCases += smCases;
    }
    smResults.sort((a, b) => b.compensation - a.compensation);
    return { smResults, totalComp, totalQual, totalSales, totalCases,
      earners: smResults.filter(s => s.compensation > 0).length,
      capHits: smResults.filter(s => s.capHit).length };
  }, [mode, config, dataset, indices, skuIdSet]);

  const update = <K extends keyof PromoConfig>(k: K, v: PromoConfig[K]) => {
    setCustomConfig(c => ({ ...c, [k]: v }));
    if (mode === 'report') setMode('edit');
  };

  if (mode === 'list') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">🎁 Promotions</h2>
          <button onClick={() => { setActivePromo(null); setCustomConfig(blankConfig); setMode('edit'); }}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
            + New Promotion
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {promos.map(p => (
            <div key={p.id} className="bg-card rounded-xl border p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{p.icon}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-sm">{p.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</p>
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                    <span>📅 {p.startDate} → {p.endDate}</span>
                    <span>🍫 "{p.skuKeyword}"</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-3 pt-3 border-t">
                <button onClick={() => { setActivePromo(p); setMode('report'); }}
                  className="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                  📊 View Report
                </button>
                <button onClick={() => { setActivePromo(null); setCustomConfig({ ...p }); setMode('edit'); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border hover:bg-muted transition-colors">
                  ✏️ Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => setMode('list')} className="px-3 py-1.5 rounded-lg text-sm font-medium border hover:bg-muted transition-colors">← Back</button>
        <h2 className="text-base font-bold">{config.name || 'New Promotion'}</h2>
      </div>

      {mode === 'edit' && (
        <div className="bg-card rounded-xl border p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div><label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Name</label>
              <input value={config.name} onChange={e => update('name', e.target.value)} className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" /></div>
            <div><label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Start</label>
              <input type="date" value={config.startDate} onChange={e => update('startDate', e.target.value)} className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" /></div>
            <div><label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">End</label>
              <input type="date" value={config.endDate} onChange={e => update('endDate', e.target.value)} className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" /></div>
            <div><label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">SKU Keyword</label>
              <input value={config.skuKeyword} onChange={e => update('skuKeyword', e.target.value)} placeholder="e.g. Lovita" className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" /></div>
          </div>
          {matchingSKUs.length > 0 && (
            <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium">
              ✅ {matchingSKUs.length} SKUs matched: {matchingSKUs.slice(0, 3).map(s => s.d).join(', ')}{matchingSKUs.length > 3 ? ` +${matchingSKUs.length - 3} more` : ''}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div><label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Method</label>
              <select value={config.method} onChange={e => update('method', e.target.value as PromoConfig['method'])} className="w-full px-3 py-2 text-sm border rounded-lg bg-background">
                <option value="per-cust-cap">Per Customer (Cap)</option>
                <option value="per-case">Per Case</option>
                <option value="per-case-min-cust">Per Case (Min Customers)</option>
              </select></div>
            <div><label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Min SKUs</label>
              <input type="number" value={config.minSkus} onChange={e => update('minSkus', +e.target.value)} className="w-full px-3 py-2 text-sm border rounded-lg bg-background" /></div>
            <div><label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Min Cases</label>
              <input type="number" value={config.minCases} onChange={e => update('minCases', +e.target.value)} className="w-full px-3 py-2 text-sm border rounded-lg bg-background" /></div>
            {config.method === 'per-cust-cap' && (
              <div><label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">SAR / Customer</label>
                <input type="number" value={config.perCustAmount} onChange={e => update('perCustAmount', +e.target.value)} className="w-full px-3 py-2 text-sm border rounded-lg bg-background" /></div>
            )}
            {(config.method === 'per-case' || config.method === 'per-case-min-cust') && (
              <div><label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">SAR / Case</label>
                <input type="number" value={config.perCaseAmount} onChange={e => update('perCaseAmount', +e.target.value)} className="w-full px-3 py-2 text-sm border rounded-lg bg-background" /></div>
            )}
          </div>
          <button onClick={() => setMode('report')} disabled={!config.startDate || !config.endDate || skuIdSet.size === 0}
            className="px-6 py-2.5 rounded-lg text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors shadow-sm">
            📊 Run Report
          </button>
        </div>
      )}

      {results && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Compensation', value: formatSAR(results.totalComp), icon: '💰', color: 'text-emerald-700' },
              { label: 'Qualifying Customers', value: formatNumber(results.totalQual), icon: '👥', color: 'text-blue-700' },
              { label: 'Earners / Cap Hits', value: `${results.earners} / ${results.capHits}`, icon: '👤', color: 'text-purple-700' },
              { label: 'Promo Sales', value: formatSAR(results.totalSales), icon: '📊', color: 'text-teal-700' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-card rounded-xl border p-4">
                <div className="text-[11px] text-muted-foreground font-semibold uppercase">{kpi.icon} {kpi.label}</div>
                <div className={`text-lg font-extrabold ${kpi.color} mt-1`}>{kpi.value}</div>
              </div>
            ))}
          </div>

          <div className="bg-card rounded-xl border p-5">
            <h3 className="text-sm font-bold mb-4">💰 Compensation by Salesman (Top 20)</h3>
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={results.smResults.slice(0, 20)} layout="vertical" barCategoryGap="15%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={140} axisLine={false} tickLine={false} />
                  <Tooltip formatter={sarFormatter} contentStyle={tooltipStyle} />
                  <Bar dataKey="compensation" fill={CHART_COLORS[2]} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-card rounded-xl border overflow-hidden">
            <div className="p-4 border-b"><h3 className="text-sm font-bold">📋 Full Salesman Breakdown</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10"><tr className="bg-muted/80 backdrop-blur-sm">
                  <th className="text-start px-4 py-3 font-semibold">#</th>
                  <th className="text-start px-4 py-3 font-semibold">Salesman</th>
                  <th className="text-start px-4 py-3 font-semibold">Branch</th>
                  <th className="text-end px-4 py-3 font-semibold">Qual.</th>
                  <th className="text-end px-4 py-3 font-semibold">Cases</th>
                  <th className="text-end px-4 py-3 font-semibold">Sales</th>
                  <th className="text-end px-4 py-3 font-semibold">Returns</th>
                  <th className="text-end px-4 py-3 font-semibold">Comp.</th>
                  <th className="text-end px-4 py-3 font-semibold">Cap</th>
                </tr></thead>
                <tbody>{results.smResults.map((sm, idx) => (
                  <tr key={sm.name} className={`border-t hover:bg-muted/30 transition-colors ${idx % 2 === 0 ? 'bg-muted/5' : ''}`}>
                    <td className="px-4 py-2.5 text-muted-foreground">{idx + 1}</td>
                    <td className="px-4 py-2.5 font-medium">{sm.name}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{sm.branch}</td>
                    <td className="px-4 py-2.5 text-end font-mono">{sm.qualCount}</td>
                    <td className="px-4 py-2.5 text-end font-mono">{formatNumber(sm.totalCases)}</td>
                    <td className="px-4 py-2.5 text-end font-mono text-emerald-600">{formatSAR(sm.totalSales)}</td>
                    <td className="px-4 py-2.5 text-end font-mono text-red-500">{sm.returnsValue > 0 ? formatSAR(sm.returnsValue) : '—'}</td>
                    <td className="px-4 py-2.5 text-end font-extrabold text-emerald-700">{formatSAR(sm.compensation)}</td>
                    <td className="px-4 py-2.5 text-end">{sm.capHit ? '🔴' : ''}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
