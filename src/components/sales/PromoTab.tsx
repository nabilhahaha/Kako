import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { SalesDataset } from '@/lib/salesTypes';
import { formatSAR, formatNumber, stringToDayIndex } from '@/lib/salesDataUtils';

const sarFmt = (v: unknown) => [formatSAR(Number(v)), 'Value'];

interface Props { dataset: SalesDataset; indices: Uint32Array }

interface PromoConfig {
  name: string;
  startDate: string;
  endDate: string;
  skuKeyword: string;
  minSkus: number;
  minCases: number;
  method: 'per-cust-cap' | 'per-case';
  perCustAmount: number;
  capCustCount: number;
  perCaseAmount: number;
}

const defaultConfig: PromoConfig = {
  name: 'New Promotion',
  startDate: '', endDate: '',
  skuKeyword: '',
  minSkus: 3, minCases: 1,
  method: 'per-cust-cap',
  perCustAmount: 10, capCustCount: 20, perCaseAmount: 4,
};

interface SmResult {
  name: string; branch: string; qualCount: number;
  totalCases: number; totalSales: number; returnsCases: number; returnsValue: number;
  compensation: number; capHit: boolean;
}

export function PromoTab({ dataset, indices }: Props) {
  const [config, setConfig] = useState<PromoConfig>(defaultConfig);
  const [ran, setRan] = useState(false);

  const matchingSKUs = useMemo(() => {
    if (!config.skuKeyword.trim()) return [];
    const kw = config.skuKeyword.toLowerCase();
    return dataset.skus.filter(s => s.d.toLowerCase().includes(kw));
  }, [dataset.skus, config.skuKeyword]);

  const skuIdSet = useMemo(() => new Set(matchingSKUs.map(s => s.id)), [matchingSKUs]);

  const results = useMemo(() => {
    if (!ran || !config.startDate || !config.endDate || skuIdSet.size === 0) return null;
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
      const cases = data.q[i], sales = data.s[i];
      if (!smCustSku[smId]) smCustSku[smId] = {};
      if (!smCustSku[smId][cuId]) smCustSku[smId][cuId] = {};
      smCustSku[smId][cuId][skId] = (smCustSku[smId][cuId][skId] || 0) + cases;
      if (!smCustSales[smId]) smCustSales[smId] = {};
      smCustSales[smId][cuId] = (smCustSales[smId][cuId] || 0) + sales;
      if (data.r[i] === 1) {
        if (!smReturns[smId]) smReturns[smId] = { cases: 0, value: 0 };
        smReturns[smId].cases += Math.abs(cases);
        smReturns[smId].value += Math.abs(sales);
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
        const cuCases = Object.values(skuCases).reduce((s, v) => s + v, 0);
        smCases += cuCases; smSales += smCustSales[smId]?.[cuId] || 0;
        if (validSkus >= config.minSkus) qualCount++;
      }
      if (smSales === 0 && qualCount === 0) continue;
      const sm = salesmen[smId];
      if (!sm || sm.n === 'BTB' || sm.n === 'MT') continue;
      const brName = dims.branches[sm.br] ?? '';
      const ret = smReturns[smId] || { cases: 0, value: 0 };

      let comp = 0, capHit = false;
      if (config.method === 'per-cust-cap') {
        const effectiveQual = Math.min(qualCount, config.capCustCount);
        comp = effectiveQual * config.perCustAmount;
        capHit = qualCount > config.capCustCount;
      } else {
        comp = smCases * config.perCaseAmount;
      }

      smResults.push({ name: sm.n, branch: brName, qualCount, totalCases: smCases, totalSales: smSales,
        returnsCases: ret.cases, returnsValue: ret.value, compensation: comp, capHit });
      totalComp += comp; totalQual += qualCount; totalSales += smSales; totalCases += smCases;
    }

    smResults.sort((a, b) => b.compensation - a.compensation);
    const earners = smResults.filter(s => s.compensation > 0).length;
    const capHits = smResults.filter(s => s.capHit).length;

    return { smResults, totalComp, totalQual, totalSales, totalCases, earners, capHits };
  }, [ran, config, dataset, indices, skuIdSet]);

  const update = <K extends keyof PromoConfig>(k: K, v: PromoConfig[K]) => {
    setConfig(c => ({ ...c, [k]: v }));
    setRan(false);
  };

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border p-5 space-y-4">
        <h3 className="text-sm font-bold">🎁 Promotion Configuration</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div><label className="text-xs font-semibold text-muted-foreground block mb-1">Promo Name</label>
            <input value={config.name} onChange={e => update('name', e.target.value)} className="w-full px-3 py-1.5 text-sm border rounded-lg bg-background" /></div>
          <div><label className="text-xs font-semibold text-muted-foreground block mb-1">Start Date</label>
            <input type="date" value={config.startDate} onChange={e => update('startDate', e.target.value)} className="w-full px-3 py-1.5 text-sm border rounded-lg bg-background" /></div>
          <div><label className="text-xs font-semibold text-muted-foreground block mb-1">End Date</label>
            <input type="date" value={config.endDate} onChange={e => update('endDate', e.target.value)} className="w-full px-3 py-1.5 text-sm border rounded-lg bg-background" /></div>
          <div><label className="text-xs font-semibold text-muted-foreground block mb-1">SKU Keyword Filter</label>
            <input value={config.skuKeyword} onChange={e => update('skuKeyword', e.target.value)} placeholder="e.g. Lovita, Wafer..." className="w-full px-3 py-1.5 text-sm border rounded-lg bg-background" /></div>
        </div>
        {matchingSKUs.length > 0 && (
          <div className="text-xs text-emerald-600 font-medium">
            ✅ {matchingSKUs.length} SKUs matched: {matchingSKUs.slice(0,5).map(s => s.d).join(', ')}{matchingSKUs.length > 5 ? ` +${matchingSKUs.length-5} more` : ''}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div><label className="text-xs font-semibold text-muted-foreground block mb-1">Method</label>
            <select value={config.method} onChange={e => update('method', e.target.value as PromoConfig['method'])} className="w-full px-3 py-1.5 text-sm border rounded-lg bg-background">
              <option value="per-cust-cap">Per Customer (Cap)</option>
              <option value="per-case">Per Case</option>
            </select></div>
          <div><label className="text-xs font-semibold text-muted-foreground block mb-1">Min SKUs/Customer</label>
            <input type="number" value={config.minSkus} onChange={e => update('minSkus', +e.target.value)} className="w-full px-3 py-1.5 text-sm border rounded-lg bg-background" /></div>
          <div><label className="text-xs font-semibold text-muted-foreground block mb-1">Min Cases/SKU</label>
            <input type="number" value={config.minCases} onChange={e => update('minCases', +e.target.value)} className="w-full px-3 py-1.5 text-sm border rounded-lg bg-background" /></div>
          {config.method === 'per-cust-cap' ? (<>
            <div><label className="text-xs font-semibold text-muted-foreground block mb-1">SAR / Customer</label>
              <input type="number" value={config.perCustAmount} onChange={e => update('perCustAmount', +e.target.value)} className="w-full px-3 py-1.5 text-sm border rounded-lg bg-background" /></div>
          </>) : (
            <div><label className="text-xs font-semibold text-muted-foreground block mb-1">SAR / Case</label>
              <input type="number" value={config.perCaseAmount} onChange={e => update('perCaseAmount', +e.target.value)} className="w-full px-3 py-1.5 text-sm border rounded-lg bg-background" /></div>
          )}
        </div>
        <button onClick={() => setRan(true)} disabled={!config.startDate || !config.endDate || skuIdSet.size === 0}
          className="px-5 py-2 rounded-lg text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors">
          📊 Run Report
        </button>
      </div>

      {results && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-card rounded-xl border p-4"><div className="text-xs text-muted-foreground">💰 Total Compensation</div><div className="text-lg font-bold text-emerald-600">{formatSAR(results.totalComp)}</div></div>
            <div className="bg-card rounded-xl border p-4"><div className="text-xs text-muted-foreground">👥 Qualifying Customers</div><div className="text-lg font-bold">{formatNumber(results.totalQual)}</div></div>
            <div className="bg-card rounded-xl border p-4"><div className="text-xs text-muted-foreground">👤 Earners / Cap Hits</div><div className="text-lg font-bold">{results.earners} / {results.capHits}</div></div>
            <div className="bg-card rounded-xl border p-4"><div className="text-xs text-muted-foreground">📊 Promo Sales</div><div className="text-lg font-bold">{formatSAR(results.totalSales)}</div></div>
          </div>

          <div className="bg-card rounded-xl border p-4">
            <h3 className="text-sm font-bold mb-3">💰 Compensation by Salesman (Top 20)</h3>
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={results.smResults.slice(0, 20)} layout="vertical">
                  <XAxis type="number" tickFormatter={(v: number) => `${v}`} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={140} />
                  <Tooltip formatter={sarFmt} contentStyle={{ borderRadius: 8 }} />
                  <Bar dataKey="compensation" fill="#10B981" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-card rounded-xl border overflow-hidden">
            <div className="p-4 border-b"><h3 className="text-sm font-bold">📋 Full Salesman Breakdown</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-muted/50">
                  <th className="text-start px-3 py-2 font-semibold">#</th>
                  <th className="text-start px-3 py-2 font-semibold">Salesman</th>
                  <th className="text-start px-3 py-2 font-semibold">Branch</th>
                  <th className="text-end px-3 py-2 font-semibold">Qual. Customers</th>
                  <th className="text-end px-3 py-2 font-semibold">Cases</th>
                  <th className="text-end px-3 py-2 font-semibold">Sales</th>
                  <th className="text-end px-3 py-2 font-semibold">Returns</th>
                  <th className="text-end px-3 py-2 font-semibold">Comp.</th>
                  <th className="text-end px-3 py-2 font-semibold">Cap</th>
                </tr></thead>
                <tbody>{results.smResults.map((sm, idx) => (
                  <tr key={sm.name} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 text-muted-foreground">{idx+1}</td>
                    <td className="px-3 py-2 font-medium">{sm.name}</td>
                    <td className="px-3 py-2 text-xs">{sm.branch}</td>
                    <td className="px-3 py-2 text-end">{sm.qualCount}</td>
                    <td className="px-3 py-2 text-end font-mono">{formatNumber(sm.totalCases)}</td>
                    <td className="px-3 py-2 text-end font-mono">{formatSAR(sm.totalSales)}</td>
                    <td className="px-3 py-2 text-end font-mono text-red-500">{sm.returnsValue > 0 ? formatSAR(sm.returnsValue) : '—'}</td>
                    <td className="px-3 py-2 text-end font-bold text-emerald-600">{formatSAR(sm.compensation)}</td>
                    <td className="px-3 py-2 text-end">{sm.capHit ? '🔴' : '—'}</td>
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
