import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { stockMovementReportEnabled } from '@/lib/van-sales/sell';
import { loadStockMovementReport } from '@/lib/van-sales/stock-movement-server';
import { PrintButton } from '@/components/print-button';
import { formatDate } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { getT } from '@/lib/i18n/server';

export default async function StockMovementsPrint({ searchParams }: { searchParams: Promise<{ rep?: string; date?: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date || '') ? sp.date! : new Date().toISOString().slice(0, 10);
  const self = !sp.rep || sp.rep === ctx.userId;
  const repId = self ? ctx.userId : sp.rep!;
  const canSelf = hasPermission(ctx, 'field.sales') || hasPermission(ctx, 'inventory.view') || ctx.isSuperAdmin;
  const canOther = hasPermission(ctx, 'reports.view') || hasPermission(ctx, 'inventory.view') || ctx.isSuperAdmin;
  if (self ? !canSelf : !canOther) redirect('/dashboard');

  const flags = ctx.companyId ? await getFeatureFlags(supabase, ctx.companyId) : null;
  if (!stockMovementReportEnabled(flags)) notFound();

  const { t, locale } = await getT();
  const intl = INTL_LOCALE[locale];
  const { data: profile } = await supabase.from('erp_profiles').select('full_name, email').eq('id', repId).maybeSingle();
  const repName = (profile as { full_name?: string | null; email?: string | null } | null)?.full_name || (profile as { email?: string } | null)?.email || '—';
  const report = await loadStockMovementReport(supabase, repId, date, locale);
  const L = (k: string) => t(`vanSales.stockMove.${k}`);
  const n = (v: number) => (v === 0 ? '—' : v.toLocaleString());

  return (
    <div className="space-y-4 text-sm">
      <div className="mb-2 flex justify-end"><PrintButton label={L('print')} /></div>
      <div className="border-b pb-3 text-center">
        <h1 className="text-lg font-bold">{ctx.company?.name ?? '—'}</h1>
        <h2 className="text-base font-semibold">{L('title')}</h2>
        <p className="text-sm"><b>{repName}</b>{report.warehouseName ? ` — ${report.warehouseName}` : ''} — {formatDate(date, intl)}</p>
      </div>

      <table className="w-full border-collapse">
        <thead><tr className="border-y bg-gray-100">
          <th className="p-1.5 text-start">{L('sku')}</th>
          <th className="p-1.5 text-end">{L('opening')}</th>
          <th className="p-1.5 text-end">{L('load')}</th>
          <th className="p-1.5 text-end">{L('sales')}</th>
          <th className="p-1.5 text-end">{L('saleableReturn')}</th>
          <th className="p-1.5 text-end">{L('damageReturn')}</th>
          <th className="p-1.5 text-end">{L('expiry')}</th>
          <th className="p-1.5 text-end">{L('adjustment')}</th>
          <th className="p-1.5 text-end">{L('current')}</th>
        </tr></thead>
        <tbody>
          {report.rows.map((r) => (
            <tr key={r.productId} className="border-b">
              <td className="p-1.5">{r.name}</td>
              <td className="p-1.5 text-end tabular-nums" dir="ltr">{n(r.opening)}</td>
              <td className="p-1.5 text-end tabular-nums" dir="ltr">{n(r.load)}</td>
              <td className="p-1.5 text-end tabular-nums" dir="ltr">{n(r.sales)}</td>
              <td className="p-1.5 text-end tabular-nums" dir="ltr">{n(r.saleableReturn)}</td>
              <td className="p-1.5 text-end tabular-nums" dir="ltr">{n(r.damageReturn)}</td>
              <td className="p-1.5 text-end tabular-nums" dir="ltr">{n(r.expiry)}</td>
              <td className="p-1.5 text-end tabular-nums" dir="ltr">{n(r.adjustment)}</td>
              <td className="p-1.5 text-end font-semibold tabular-nums" dir="ltr">{r.current.toLocaleString()}</td>
            </tr>
          ))}
          {report.rows.length === 0 && <tr><td colSpan={9} className="p-2 text-center text-gray-500">{L('empty')}</td></tr>}
        </tbody>
        <tfoot className="border-t-2 font-bold">
          <tr>
            <td className="p-1.5">{L('total')}</td>
            <td className="p-1.5 text-end tabular-nums" dir="ltr">{n(report.totals.opening)}</td>
            <td className="p-1.5 text-end tabular-nums" dir="ltr">{n(report.totals.load)}</td>
            <td className="p-1.5 text-end tabular-nums" dir="ltr">{n(report.totals.sales)}</td>
            <td className="p-1.5 text-end tabular-nums" dir="ltr">{n(report.totals.saleableReturn)}</td>
            <td className="p-1.5 text-end tabular-nums" dir="ltr">{n(report.totals.damageReturn)}</td>
            <td className="p-1.5 text-end tabular-nums" dir="ltr">{n(report.totals.expiry)}</td>
            <td className="p-1.5 text-end tabular-nums" dir="ltr">{n(report.totals.adjustment)}</td>
            <td className="p-1.5 text-end tabular-nums" dir="ltr">{report.totals.current.toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>
      <p className="text-xs text-gray-600">{L('formula')}</p>
    </div>
  );
}
