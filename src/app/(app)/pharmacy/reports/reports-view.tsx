'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency, formatDate } from '@/lib/utils';

export interface ReportsData {
  gross_profit?: number;
  period_sales?: number;
  daily_sales?: Array<{ date: string; total: number; count: number }>;
  by_medicine?: Array<{ name: string; name_ar: string | null; qty: number; revenue: number; gp: number }>;
  inventory_balance?: Array<{ name: string; name_ar: string | null; code: string; uom: string | null; qty: number; value: number }>;
  low_stock?: Array<{ name: string; name_ar: string | null; code: string; qty: number; min: number }>;
  dead_stock?: Array<{ name: string; name_ar: string | null; code: string; qty: number }>;
  returns?: Array<{ number: string; amount: number; status: string; date: string; customer: string | null }>;
}

type Tab = 'daily' | 'medicine' | 'balance' | 'low' | 'dead' | 'returns';
const TABS: Tab[] = ['daily', 'medicine', 'balance', 'low', 'dead', 'returns'];

export function ReportsView({ data, intlLocale }: { data: ReportsData; intlLocale: string }) {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<Tab>('daily');
  const money = (n: number | null | undefined) => formatCurrency(Number(n ?? 0), 'EGP', intlLocale);
  const nm = (x: { name: string; name_ar: string | null }) => (locale === 'ar' ? x.name_ar || x.name : x.name);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">{t('pharmReports.periodSales')}</div><div className="text-xl font-bold" dir="ltr">{money(data.period_sales)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">{t('pharmReports.gp')}</div><div className="text-xl font-bold text-emerald-600" dir="ltr">{money(data.gross_profit)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">{t('pharmReports.more')}</div>
          <div className="flex gap-3 text-sm">
            <Link href="/pharmacy/expiry" className="text-primary hover:underline">{t('pharmReports.expiry')}</Link>
            <Link href="/cashbox" className="text-primary hover:underline">{t('pharmReports.cash')}</Link>
          </div></CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-1">
        {TABS.map((x) => (
          <button key={x} onClick={() => setTab(x)}
            className={`rounded-full px-3 py-1 text-sm ${tab === x ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}>
            {t(`pharmReports.tab.${x}`)}
          </button>
        ))}
      </div>

      <Card><CardContent className="p-0">
        {tab === 'daily' && (
          <Table head={[t('pharmReports.date'), t('pharmReports.count'), t('pharmReports.total')]}
            rows={(data.daily_sales ?? []).map((r) => [formatDate(r.date, intlLocale), String(r.count), money(r.total)])} />
        )}
        {tab === 'medicine' && (
          <Table head={[t('pharmReports.product'), t('pharmReports.qty'), t('pharmReports.revenue'), t('pharmReports.gp')]}
            rows={(data.by_medicine ?? []).map((r) => [nm(r), String(r.qty), money(r.revenue), money(r.gp)])} />
        )}
        {tab === 'balance' && (
          <Table head={[t('pharmReports.product'), t('pharmReports.qty'), t('pharmReports.value')]}
            rows={(data.inventory_balance ?? []).map((r) => [`${nm(r)}`, `${r.qty} ${r.uom ?? ''}`, money(r.value)])} />
        )}
        {tab === 'low' && (
          <Table head={[t('pharmReports.product'), t('pharmReports.qty'), t('pharmReports.min')]}
            rows={(data.low_stock ?? []).map((r) => [nm(r), String(r.qty), String(r.min)])} />
        )}
        {tab === 'dead' && (
          <Table head={[t('pharmReports.product'), t('pharmReports.qty')]}
            rows={(data.dead_stock ?? []).map((r) => [nm(r), String(r.qty)])} />
        )}
        {tab === 'returns' && (
          <Table head={[t('pharmReports.number'), t('pharmReports.customer'), t('pharmReports.amount'), t('pharmReports.date')]}
            rows={(data.returns ?? []).map((r) => [r.number, r.customer ?? '—', money(r.amount), formatDate(r.date, intlLocale)])} />
        )}
      </CardContent></Card>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  const { t } = useI18n();
  if (rows.length === 0) return <p className="p-8 text-center text-sm text-muted-foreground">{t('pharmReports.empty')}</p>;
  return (
    <div className="overflow-x-auto"><table className="w-full text-sm">
      <thead className="border-b bg-muted/40 text-muted-foreground"><tr>
        {head.map((h, i) => <th key={i} className={`p-3 font-medium ${i === 0 ? 'text-start' : 'text-end'}`}>{h}</th>)}
      </tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b last:border-0">
            {r.map((c, j) => <td key={j} className={`p-3 ${j === 0 ? 'text-start' : 'text-end tabular-nums'}`} dir={j === 0 ? undefined : 'ltr'}>{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}
