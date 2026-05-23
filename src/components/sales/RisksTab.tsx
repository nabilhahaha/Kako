import { useMemo } from 'react';
import type { SalesDataset } from '@/lib/salesTypes';
import { formatSAR, formatPercent } from '@/lib/salesDataUtils';

interface Props { dataset: SalesDataset; indices: Uint32Array }

interface RiskItem {
  name: string;
  metric: string;
  value: number;
  formatted: string;
  status: 'breach' | 'watch' | 'ok';
  action: string;
}

export function RisksTab({ dataset, indices }: Props) {
  const risks = useMemo(() => {
    const { data, customers, skus, salesmen } = dataset;
    let posSales = 0, returnsVal = 0, totalDiscount = 0;
    const salesByCu = new Map<number, number>();
    const salesByRg = new Map<number, number>();
    const salesBySm = new Map<number, number>();
    const salesBySk = new Map<number, number>();

    for (const i of indices) {
      const s = data.s[i];
      if (data.r[i] === 1) { returnsVal += Math.abs(s); continue; }
      posSales += s;
      totalDiscount += Math.abs(data.di[i]);

      const cu = data.cu[i];
      salesByCu.set(cu, (salesByCu.get(cu) || 0) + s);

      const rg = customers[cu].rg;
      salesByRg.set(rg, (salesByRg.get(rg) || 0) + s);

      salesBySm.set(data.sm[i], (salesBySm.get(data.sm[i]) || 0) + s);
      salesBySk.set(data.sk[i], (salesBySk.get(data.sk[i]) || 0) + s);
    }

    const cuSorted = [...salesByCu.values()].sort((a, b) => b - a);
    const rgSorted = [...salesByRg.values()].sort((a, b) => b - a);
    const smValues = [...salesBySm.values()];
    const skValues = [...salesBySk.values()];

    const top1Share = posSales > 0 && cuSorted.length > 0 ? (cuSorted[0] / posSales) * 100 : 0;
    const top5Sum = cuSorted.slice(0, 5).reduce((s, v) => s + v, 0);
    const top5Share = posSales > 0 ? (top5Sum / posSales) * 100 : 0;
    const topRegionShare = posSales > 0 && rgSorted.length > 0 ? (rgSorted[0] / posSales) * 100 : 0;
    const returnRate = posSales + returnsVal > 0 ? (returnsVal / (posSales + returnsVal)) * 100 : 0;
    const discountRate = posSales + totalDiscount > 0 ? (totalDiscount / (posSales + totalDiscount)) * 100 : 0;
    const lowProdSm = smValues.filter(v => v < 100000).length;
    const slowSKUs = skValues.filter(v => v < 5000).length;

    const items: RiskItem[] = [
      {
        name: 'Returns Rate',
        metric: 'Total returns / gross sales',
        value: returnRate,
        formatted: formatPercent(returnRate),
        status: returnRate > 5 ? 'breach' : returnRate > 3 ? 'watch' : 'ok',
        action: `Reduce 1% = ~${formatSAR(posSales * 0.01)} savings`,
      },
      {
        name: 'Top-1 Customer Concentration',
        metric: 'Largest customer / total sales',
        value: top1Share,
        formatted: formatPercent(top1Share),
        status: top1Share > 10 ? 'breach' : top1Share > 5 ? 'watch' : 'ok',
        action: 'Diversify, lock long-term contracts',
      },
      {
        name: 'Top-5 Customer Concentration',
        metric: 'Top 5 customers / total sales',
        value: top5Share,
        formatted: formatPercent(top5Share),
        status: top5Share > 35 ? 'breach' : top5Share > 20 ? 'watch' : 'ok',
        action: 'Build broader mid-tier pipeline',
      },
      {
        name: 'Top Region Concentration',
        metric: 'Largest region / total sales',
        value: topRegionShare,
        formatted: formatPercent(topRegionShare),
        status: topRegionShare > 65 ? 'breach' : topRegionShare > 50 ? 'watch' : 'ok',
        action: 'Expand under-penetrated regions',
      },
      {
        name: 'Discount Erosion',
        metric: 'Total discount / (sales + discount)',
        value: discountRate,
        formatted: formatPercent(discountRate),
        status: discountRate > 15 ? 'breach' : discountRate > 10 ? 'watch' : 'ok',
        action: 'Audit discount policy',
      },
      {
        name: 'Low Productivity Salesmen',
        metric: `Salesmen with < 100K SAR (${smValues.length} total)`,
        value: lowProdSm,
        formatted: `${lowProdSm} of ${salesmen.length}`,
        status: lowProdSm > 10 ? 'breach' : lowProdSm > 5 ? 'watch' : 'ok',
        action: 'Coaching or territory reassignment',
      },
      {
        name: 'Slow SKUs',
        metric: `SKUs with < 5K SAR (${skValues.length} active)`,
        value: slowSKUs,
        formatted: `${slowSKUs} of ${skus.length}`,
        status: slowSKUs > 15 ? 'breach' : slowSKUs > 8 ? 'watch' : 'ok',
        action: 'Delist or relaunch with activation',
      },
    ];

    const breaches = items.filter(r => r.status === 'breach').length;
    const watches = items.filter(r => r.status === 'watch').length;

    return { items, breaches, watches };
  }, [dataset, indices]);

  const badge = (s: 'breach' | 'watch' | 'ok') =>
    s === 'breach' ? '🔴' : s === 'watch' ? '🟡' : '🟢';

  const badgeBg = (s: 'breach' | 'watch' | 'ok') =>
    s === 'breach' ? 'bg-red-50 border-red-200' : s === 'watch' ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-red-600">{risks.breaches}</div>
          <div className="text-xs font-bold text-red-500">🔴 BREACHES</div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-yellow-600">{risks.watches}</div>
          <div className="text-xs font-bold text-yellow-600">🟡 WATCH</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-green-600">{7 - risks.breaches - risks.watches}</div>
          <div className="text-xs font-bold text-green-600">🟢 OK</div>
        </div>
      </div>

      <div className="space-y-3">
        {risks.items.map((risk) => (
          <div key={risk.name} className={`rounded-xl border p-4 ${badgeBg(risk.status)}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{badge(risk.status)}</span>
                  <h3 className="text-sm font-bold">{risk.name}</h3>
                  <span className="text-lg font-black">{risk.formatted}</span>
                </div>
                <p className="text-xs text-muted-foreground">{risk.metric}</p>
              </div>
              <div className="text-end shrink-0">
                <span className="text-[10px] px-2 py-1 rounded-full bg-background border font-medium">
                  {risk.action}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
