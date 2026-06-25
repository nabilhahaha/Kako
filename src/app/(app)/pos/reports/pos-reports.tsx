'use client';

import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Loader2, RefreshCw, Download, ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';
import { buildXlsxWorkbook } from '@/lib/erp/xlsx-write';
import { downloadXlsx } from '@/app/(app)/distribution/route-planner/xlsx-download';
import { getPosReport, type PosPeriod, type PosReportData } from './pos-report-actions';
import type { Bucket, ItemBucket } from './pos-report';

type Tab = 'summary' | 'byCashier' | 'byProduct' | 'byCategory' | 'byPayment' | 'byMode' | 'hourly' | 'top';
const TABS: Tab[] = ['summary', 'byCashier', 'byProduct', 'byCategory', 'byPayment', 'byMode', 'hourly', 'top'];

export function PosReports() {
  const { t } = useI18n();
  const [period, setPeriod] = useState<PosPeriod>('today');
  const [data, setData] = useState<PosReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('summary');

  const load = useCallback(async (p: PosPeriod) => {
    setLoading(true);
    const res = await getPosReport(p);
    setData(res.ok ? res.data : null);
    setLoading(false);
  }, []);
  useEffect(() => { void load(period); }, [period, load]);

  function label(k: string) {
    if (k === 'cash' || k === 'card') return t(`foodPosReports.method_${k}`);
    if (k === 'dine_in' || k === 'takeaway' || k === 'delivery') return t(`foodPosReports.mode_${k}`);
    return k;
  }

  function onExport() {
    if (!data) return;
    const orderRows = (title: string, b: Bucket[]) => [[title, t('foodPosReports.colOrders'), t('foodPosReports.colRevenue')], ...b.map((x) => [label(x.label || x.key), x.orders, x.revenue])];
    const itemRows = (title: string, b: ItemBucket[]) => [[title, t('foodPosReports.colQty'), t('foodPosReports.colRevenue')], ...b.map((x) => [label(x.label || x.key), x.qty, x.revenue])];
    const wb = buildXlsxWorkbook([
      { name: t('foodPosReports.tab_summary'), rows: [
        [t('foodPosReports.kpiOrders'), data.summary.orders],
        [t('foodPosReports.kpiRevenue'), data.summary.revenue],
        [t('foodPosReports.kpiAvgTicket'), data.summary.avgTicket],
        [t('foodPosReports.kpiItems'), data.summary.itemsSold],
      ] },
      { name: t('foodPosReports.tab_byCashier'), rows: orderRows(t('foodPosReports.colCashier'), data.byCashier) },
      { name: t('foodPosReports.tab_byProduct'), rows: itemRows(t('foodPosReports.colProduct'), data.byProduct) },
      { name: t('foodPosReports.tab_byCategory'), rows: itemRows(t('foodPosReports.colCategory'), data.byCategory) },
      { name: t('foodPosReports.tab_byPayment'), rows: orderRows(t('foodPosReports.colMethod'), data.byPayment) },
      { name: t('foodPosReports.tab_byMode'), rows: orderRows(t('foodPosReports.colMode'), data.byMode) },
      { name: t('foodPosReports.tab_hourly'), rows: orderRows(t('foodPosReports.colHour'), data.hourly.filter((h) => h.orders > 0)) },
    ]);
    downloadXlsx(wb, `pos-sales-${period}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href="/pos" className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary" aria-label={t('foodPosReports.back')}><ChevronLeft className="h-5 w-5 rtl:rotate-180" /></Link>
          <div>
            <h1 className="flex items-center gap-2 text-lg font-bold"><BarChart3 className="h-5 w-5 text-primary" /> {t('foodPosReports.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('foodPosReports.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onExport} disabled={!data || data.summary.orders === 0} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"><Download className="h-4 w-4" /> {t('foodPosReports.export')}</button>
          <button onClick={() => void load(period)} className="rounded-lg border p-2" aria-label={t('foodPosReports.refresh')}><RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /></button>
        </div>
      </div>

      <div className="mb-4 flex gap-1 rounded-lg bg-secondary p-1 sm:w-72">
        {(['today', 'week', 'month'] as const).map((p) => (
          <button key={p} onClick={() => setPeriod(p)} className={cn('flex-1 rounded-md py-1.5 text-sm font-medium', period === p ? 'bg-card shadow-sm' : 'text-muted-foreground')}>{t(`foodPosReports.date_${p}`)}</button>
        ))}
      </div>

      {loading ? <div className="flex justify-center py-16 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div> : !data ? null : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Kpi label={t('foodPosReports.kpiOrders')} value={data.summary.orders} />
            <Kpi label={t('foodPosReports.kpiRevenue')} value={data.summary.revenue.toFixed(2)} tone />
            <Kpi label={t('foodPosReports.kpiAvgTicket')} value={data.summary.avgTicket.toFixed(2)} />
            <Kpi label={t('foodPosReports.kpiItems')} value={data.summary.itemsSold} />
          </div>

          <div className="mb-3 flex gap-1.5 overflow-x-auto">
            {TABS.map((tb) => (
              <button key={tb} onClick={() => setTab(tb)} className={cn('shrink-0 rounded-full px-3 py-1.5 text-sm font-medium', tab === tb ? 'bg-primary text-primary-foreground' : 'border bg-card')}>{t(`foodPosReports.tab_${tb}`)}</button>
            ))}
          </div>

          {data.summary.orders === 0 ? (
            <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">{t('foodPosReports.empty')}</div>
          ) : tab === 'summary' ? (
            <Table cols={[t('foodPosReports.colMode'), t('foodPosReports.colOrders'), t('foodPosReports.colRevenue')]} rows={data.byMode.map((b) => [label(b.label || b.key), b.orders, b.revenue.toFixed(2)])} />
          ) : tab === 'byCashier' ? <Table cols={[t('foodPosReports.colCashier'), t('foodPosReports.colOrders'), t('foodPosReports.colRevenue')]} rows={data.byCashier.map((b) => [b.label, b.orders, b.revenue.toFixed(2)])} />
          : tab === 'byPayment' ? <Table cols={[t('foodPosReports.colMethod'), t('foodPosReports.colOrders'), t('foodPosReports.colRevenue')]} rows={data.byPayment.map((b) => [label(b.label || b.key), b.orders, b.revenue.toFixed(2)])} />
          : tab === 'byMode' ? <Table cols={[t('foodPosReports.colMode'), t('foodPosReports.colOrders'), t('foodPosReports.colRevenue')]} rows={data.byMode.map((b) => [label(b.label || b.key), b.orders, b.revenue.toFixed(2)])} />
          : tab === 'hourly' ? <Table cols={[t('foodPosReports.colHour'), t('foodPosReports.colOrders'), t('foodPosReports.colRevenue')]} rows={data.hourly.filter((h) => h.orders > 0).map((b) => [b.label, b.orders, b.revenue.toFixed(2)])} />
          : tab === 'byCategory' ? <Table cols={[t('foodPosReports.colCategory'), t('foodPosReports.colQty'), t('foodPosReports.colRevenue')]} rows={data.byCategory.map((b) => [b.label, b.qty, b.revenue.toFixed(2)])} />
          : <Table cols={[t('foodPosReports.colProduct'), t('foodPosReports.colQty'), t('foodPosReports.colRevenue')]} rows={(tab === 'top' ? data.top : data.byProduct).map((b) => [b.label, b.qty, b.revenue.toFixed(2)])} />}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: boolean }) {
  return <div className="rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className={cn('mt-0.5 text-xl font-bold', tone && 'text-primary')}>{value}</p></div>;
}
function Table({ cols, rows }: { cols: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-secondary text-xs text-muted-foreground"><tr>{cols.map((c, i) => <th key={i} className={cn('px-3 py-2 font-medium', i === 0 ? 'text-start' : 'text-end')}>{c}</th>)}</tr></thead>
        <tbody className="divide-y">
          {rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={cn('px-3 py-2', j === 0 ? 'text-start font-medium' : 'text-end tabular-nums')}>{v}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}
