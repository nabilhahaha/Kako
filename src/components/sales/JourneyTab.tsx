import { useMemo } from 'react';
import type { SalesDataset } from '@/lib/salesTypes';
import { formatSAR, formatNumber, stringToDayIndex } from '@/lib/salesDataUtils';

interface Props {
  dataset: SalesDataset;
  indices: Uint32Array;
}

interface CustomerRFM {
  custIdx: number;
  recency: number;
  frequency: number;
  monetary: number;
  rScore: number;
  fScore: number;
  mScore: number;
}

type SegmentName =
  | 'Champions'
  | 'Loyal'
  | 'At Risk'
  | "Can't Lose"
  | 'New'
  | 'Lost'
  | 'Others';

interface SegmentInfo {
  name: SegmentName;
  count: number;
  totalRevenue: number;
  avgOrderValue: number;
  recommendation: string;
}

function computeQuintiles(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return [];
  const thresholds: number[] = [];
  for (let q = 1; q <= 4; q++) {
    const idx = Math.floor((q / 5) * n);
    thresholds.push(sorted[Math.min(idx, n - 1)]);
  }
  return thresholds;
}

function scoreByQuintile(value: number, thresholds: number[]): number {
  if (thresholds.length === 0) return 3;
  if (value <= thresholds[0]) return 1;
  if (value <= thresholds[1]) return 2;
  if (value <= thresholds[2]) return 3;
  if (value <= thresholds[3]) return 4;
  return 5;
}

function classifySegment(r: number, f: number, m: number): SegmentName {
  if (r >= 4 && f >= 4 && m >= 4) return 'Champions';
  if (f >= 3 && m >= 3) return 'Loyal';
  if (r <= 2 && f >= 3) return 'At Risk';
  if (r <= 2 && m >= 4) return "Can't Lose";
  if (r >= 4 && f <= 2) return 'New';
  if (r <= 2 && f <= 2 && m <= 2) return 'Lost';
  return 'Others';
}

const SEGMENT_RECOMMENDATIONS: Record<SegmentName, string> = {
  Champions: 'Reward them. Offer exclusive deals, early access, and loyalty programs to keep them engaged.',
  Loyal: 'Upsell higher-value products. Recommend related items and introduce premium tiers.',
  'At Risk': 'Send re-engagement campaigns immediately. Offer incentives or personal outreach before they churn.',
  "Can't Lose": 'High-value customers slipping away. Assign dedicated account managers and provide VIP treatment.',
  New: 'Nurture the relationship. Provide onboarding support, welcome offers, and prompt follow-ups.',
  Lost: 'Win-back campaigns with strong offers. Survey to understand reasons for leaving.',
  Others: 'Segment further and personalize communication. Move them toward Loyal or Champions status.',
};

const SEGMENT_COLORS: Record<SegmentName, string> = {
  Champions: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  Loyal: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  'At Risk': 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  "Can't Lose": 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  New: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  Lost: 'bg-gray-100 text-gray-800 dark:bg-gray-700/40 dark:text-gray-300',
  Others: 'bg-slate-100 text-slate-800 dark:bg-slate-700/40 dark:text-slate-300',
};

export function JourneyTab({ dataset, indices }: Props) {
  const analysis = useMemo(() => {
    const { data } = dataset;
    const maxDayIdx = stringToDayIndex(dataset.meta.dateMax);

    // Aggregate per customer: last purchase day, frequency, monetary
    const custMap = new Map<
      number,
      { lastDay: number; txCount: number; totalSales: number; totalOrders: number }
    >();

    for (const i of indices) {
      if (data.r[i] === 1) continue; // skip returns
      const cuIdx = data.cu[i];
      const dayIdx = data.d[i];
      const sales = data.s[i];

      let entry = custMap.get(cuIdx);
      if (!entry) {
        entry = { lastDay: dayIdx, txCount: 0, totalSales: 0, totalOrders: 0 };
        custMap.set(cuIdx, entry);
      }
      if (dayIdx > entry.lastDay) entry.lastDay = dayIdx;
      entry.txCount++;
      entry.totalSales += sales;
      entry.totalOrders++;
    }

    if (custMap.size === 0) {
      return {
        totalCustomers: 0,
        rfmCustomers: [] as CustomerRFM[],
        segments: [] as SegmentInfo[],
        heatmap: Array.from({ length: 5 }, () => new Array(5).fill(0)) as number[][],
      };
    }

    // Compute raw RFM values
    const rawRecency: number[] = [];
    const rawFrequency: number[] = [];
    const rawMonetary: number[] = [];
    const custEntries: { custIdx: number; recency: number; frequency: number; monetary: number }[] = [];

    for (const [custIdx, entry] of custMap) {
      const recency = maxDayIdx - entry.lastDay; // days since last purchase
      const frequency = entry.txCount;
      const monetary = entry.totalSales;
      rawRecency.push(recency);
      rawFrequency.push(frequency);
      rawMonetary.push(monetary);
      custEntries.push({ custIdx, recency, frequency, monetary });
    }

    // Compute quintile thresholds
    const rThresholds = computeQuintiles(rawRecency);
    const fThresholds = computeQuintiles(rawFrequency);
    const mThresholds = computeQuintiles(rawMonetary);

    // Score each customer — note: for recency, lower is better, so invert
    const rfmCustomers: CustomerRFM[] = custEntries.map((entry) => {
      const rRaw = scoreByQuintile(entry.recency, rThresholds);
      // Invert recency: low recency (recent) = high score
      const rScore = 6 - rRaw;
      const fScore = scoreByQuintile(entry.frequency, fThresholds);
      const mScore = scoreByQuintile(entry.monetary, mThresholds);
      return {
        custIdx: entry.custIdx,
        recency: entry.recency,
        frequency: entry.frequency,
        monetary: entry.monetary,
        rScore,
        fScore,
        mScore,
      };
    });

    // Build heatmap: R (rows 1-5) x F (cols 1-5)
    const heatmap: number[][] = Array.from({ length: 5 }, () => new Array(5).fill(0));
    for (const c of rfmCustomers) {
      heatmap[c.rScore - 1][c.fScore - 1]++;
    }

    // Segment customers
    const segmentMap = new Map<SegmentName, { count: number; totalRevenue: number; totalOrders: number }>();
    const allSegments: SegmentName[] = ['Champions', 'Loyal', 'At Risk', "Can't Lose", 'New', 'Lost', 'Others'];
    for (const s of allSegments) {
      segmentMap.set(s, { count: 0, totalRevenue: 0, totalOrders: 0 });
    }

    for (const c of rfmCustomers) {
      const seg = classifySegment(c.rScore, c.fScore, c.mScore);
      const entry = segmentMap.get(seg)!;
      entry.count++;
      entry.totalRevenue += c.monetary;
      entry.totalOrders += c.frequency;
    }

    const segments: SegmentInfo[] = allSegments
      .map((name) => {
        const e = segmentMap.get(name)!;
        return {
          name,
          count: e.count,
          totalRevenue: e.totalRevenue,
          avgOrderValue: e.totalOrders > 0 ? e.totalRevenue / e.totalOrders : 0,
          recommendation: SEGMENT_RECOMMENDATIONS[name],
        };
      })
      .filter((s) => s.count > 0);

    return {
      totalCustomers: custMap.size,
      rfmCustomers,
      segments,
      heatmap,
    };
  }, [dataset, indices]);

  const maxHeatmapVal = useMemo(() => {
    let max = 0;
    for (const row of analysis.heatmap) {
      for (const val of row) {
        if (val > max) max = val;
      }
    }
    return max;
  }, [analysis.heatmap]);

  function heatmapBg(val: number): string {
    if (val === 0 || maxHeatmapVal === 0) return 'bg-muted/30';
    const intensity = val / maxHeatmapVal;
    if (intensity > 0.8) return 'bg-emerald-600 text-white';
    if (intensity > 0.6) return 'bg-emerald-500 text-white';
    if (intensity > 0.4) return 'bg-emerald-400 text-white';
    if (intensity > 0.2) return 'bg-emerald-300 text-emerald-900';
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
  }

  if (analysis.totalCustomers === 0) {
    return (
      <div className="dash-card p-8 text-center text-muted-foreground">
        No customer data available for the selected filters.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="dash-card p-4">
          <div className="text-xs text-muted-foreground">Total Customers</div>
          <div className="text-lg font-bold">{formatNumber(analysis.totalCustomers)}</div>
        </div>
        {analysis.segments.slice(0, 3).map((seg) => (
          <div key={seg.name} className="dash-card p-4">
            <div className="text-xs text-muted-foreground">{seg.name}</div>
            <div className="text-lg font-bold">{formatNumber(seg.count)}</div>
            <div className="text-xs text-muted-foreground">{formatSAR(seg.totalRevenue)}</div>
          </div>
        ))}
      </div>

      {/* Heatmap: R x F */}
      <div className="chart-card">
        <h3>Recency x Frequency Heatmap</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Rows = Recency score (5 = most recent, 1 = least recent).
          Columns = Frequency score (1 = fewest, 5 = most transactions).
        </p>
        <div className="overflow-x-auto">
          <table className="mx-auto border-collapse">
            <thead>
              <tr>
                <th className="p-2 text-xs text-muted-foreground font-semibold">R \ F</th>
                {[1, 2, 3, 4, 5].map((f) => (
                  <th key={f} className="p-2 text-xs text-muted-foreground font-semibold text-center w-16">
                    F={f}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[5, 4, 3, 2, 1].map((r) => (
                <tr key={r}>
                  <td className="p-2 text-xs text-muted-foreground font-semibold">R={r}</td>
                  {[0, 1, 2, 3, 4].map((fIdx) => {
                    const val = analysis.heatmap[r - 1][fIdx];
                    return (
                      <td
                        key={fIdx}
                        className={`w-16 h-12 text-center text-xs font-semibold rounded-md border border-background ${heatmapBg(val)}`}
                      >
                        {val > 0 ? formatNumber(val) : '-'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Segment Table */}
      <div className="dash-card overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="text-sm font-bold">Customer Segments</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Segment</th>
                <th className="text-end">Customers</th>
                <th className="text-end">Total Revenue</th>
                <th className="text-end">Avg Order Value</th>
                <th>Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {analysis.segments.map((seg) => (
                <tr key={seg.name}>
                  <td>
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${SEGMENT_COLORS[seg.name]}`}
                    >
                      {seg.name}
                    </span>
                  </td>
                  <td className="num">{formatNumber(seg.count)}</td>
                  <td className="num">{formatSAR(seg.totalRevenue)}</td>
                  <td className="num">{formatSAR(seg.avgOrderValue)}</td>
                  <td className="text-xs text-muted-foreground max-w-xs">{seg.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
