import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PrintButton } from '@/components/print-button';
import { formatNumber, formatDate } from '@/lib/utils';
import type { Warehouse } from '@/lib/erp/types';

interface StockLine {
  quantity: number;
  product: { code: string; name: string; name_ar: string | null } | null;
}

export default async function StockPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;

  const supabase = await createClient();
  const { data: warehouse } = await supabase
    .from('erp_warehouses')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!warehouse) notFound();
  const wh = warehouse as Warehouse;

  const { data: stock } = await supabase
    .from('erp_inventory_stock')
    .select('quantity, product:erp_products_catalog(code, name, name_ar)')
    .eq('warehouse_id', id)
    .gt('quantity', 0);
  const lines = ((stock as unknown as StockLine[]) ?? []).sort((a, b) =>
    (a.product?.name_ar || a.product?.name || '').localeCompare(b.product?.name_ar || b.product?.name || ''),
  );
  const totalQty = lines.reduce((s, l) => s + Number(l.quantity), 0);

  return (
    <div className="space-y-5 text-sm">
      <div className="mb-2 flex justify-end">
        <PrintButton label="طباعة جرد المخزون" />
      </div>
      <div className="border-b pb-3 text-center">
        <h1 className="text-lg font-bold">{wh.is_van ? 'جرد مخزون السيارة' : 'جرد المخزون'}</h1>
        <p className="text-sm">{wh.code} · {wh.name_ar || wh.name} — {formatDate(new Date())}</p>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y bg-gray-100">
            <th className="p-2 text-right">#</th>
            <th className="p-2 text-right">الكود</th>
            <th className="p-2 text-right">الصنف</th>
            <th className="p-2 text-left">الكمية</th>
            <th className="p-2 text-center w-24">المعدود</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b">
              <td className="p-2">{i + 1}</td>
              <td className="p-2 font-mono text-xs" dir="ltr">{l.product?.code}</td>
              <td className="p-2">{l.product?.name_ar || l.product?.name || '—'}</td>
              <td className="p-2 text-left tabular-nums" dir="ltr">{formatNumber(l.quantity)}</td>
              <td className="p-2"></td>
            </tr>
          ))}
          {lines.length === 0 && <tr><td colSpan={5} className="p-3 text-center text-gray-500">المخزن فارغ.</td></tr>}
        </tbody>
        <tfoot className="border-t-2 font-bold">
          <tr><td className="p-2" colSpan={3}>إجمالي الكميات</td><td className="p-2 text-left tabular-nums" dir="ltr">{formatNumber(totalQty)}</td><td></td></tr>
        </tfoot>
      </table>
      <p className="text-xs text-gray-500">خانة «المعدود» للجرد اليدوي عند المطابقة.</p>
    </div>
  );
}
