import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PrintButton } from '@/components/print-button';
import { PAYMENT_METHOD_LABELS } from '@/lib/erp/constants';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { PaymentMethod, PurchaseOrder, Supplier, SupplierPayment } from '@/lib/erp/types';

interface Entry { date: string; ref: string; desc: string; debit: number; credit: number }

export default async function SupplierStatementPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;

  const supabase = await createClient();
  const { data: supplier } = await supabase.from('erp_suppliers').select('*').eq('id', id).maybeSingle();
  if (!supplier) notFound();
  const s = supplier as Supplier & { company_id: string | null };

  const [{ data: company }, { data: pos }, { data: payments }, { data: openings }, { data: returns }] = await Promise.all([
    s.company_id
      ? supabase.from('erp_companies').select('name, name_ar').eq('id', s.company_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('erp_purchase_orders').select('id, po_number, net_amount, updated_at').eq('supplier_id', id).eq('status', 'received'),
    supabase.from('erp_supplier_payments').select('amount, payment_method, payment_date, reference_number').eq('supplier_id', id),
    supabase.from('erp_supplier_opening_balances').select('balance_type, amount, as_of_date').eq('supplier_id', id).eq('status', 'active'),
    supabase.from('erp_purchase_returns').select('return_number, total_amount, created_at, status').eq('supplier_id', id).neq('status', 'draft').neq('status', 'cancelled'),
  ]);

  const poList = (pos as Pick<PurchaseOrder, 'id' | 'po_number' | 'net_amount' | 'updated_at'>[]) ?? [];
  const payList = (payments as Pick<SupplierPayment, 'amount' | 'payment_method' | 'payment_date' | 'reference_number'>[]) ?? [];
  const openList = (openings as { balance_type: 'credit' | 'debit'; amount: number; as_of_date: string }[]) ?? [];
  const retList = (returns as { return_number: string; total_amount: number; created_at: string }[]) ?? [];
  const co = company as { name: string; name_ar: string | null } | null;

  const entries: Entry[] = [
    ...openList.map((o) => ({
      date: o.as_of_date, ref: '—', desc: 'رصيد افتتاحي',
      debit: o.balance_type === 'credit' ? Number(o.amount) : 0,
      credit: o.balance_type === 'debit' ? Number(o.amount) : 0,
    })),
    ...poList.map((p) => ({ date: p.updated_at, ref: p.po_number, desc: 'استلام بضاعة', debit: Number(p.net_amount), credit: 0 })),
    ...payList.map((p) => ({
      date: p.payment_date, ref: p.reference_number || '—',
      desc: `سداد (${PAYMENT_METHOD_LABELS[p.payment_method as PaymentMethod]?.ar ?? ''})`, debit: 0, credit: Number(p.amount),
    })),
    ...retList.map((r) => ({ date: r.created_at, ref: r.return_number, desc: 'مرتجع مشتريات', debit: 0, credit: Number(r.total_amount) })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let running = 0;
  const rows = entries.map((e) => { running += e.debit - e.credit; return { ...e, balance: running }; });

  return (
    <div className="space-y-5 text-sm">
      <div className="mb-2 flex justify-end">
        <PrintButton label="طباعة كشف الحساب" />
      </div>
      <div className="border-b pb-3 text-center">
        <h1 className="text-lg font-bold">{co?.name_ar || co?.name || 'الشركة'}</h1>
        <h2 className="mt-1 text-base font-bold">كشف حساب مورد</h2>
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        <span>المورد: <b>{s.name_ar || s.name}</b></span>
        <span>الكود: <b dir="ltr">{s.code}</b></span>
        <span>الرصيد المستحق: <b dir="ltr">{formatCurrency(s.balance)}</b></span>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y bg-gray-100">
            <th className="p-2 text-right">التاريخ</th>
            <th className="p-2 text-right">المرجع</th>
            <th className="p-2 text-right">البيان</th>
            <th className="p-2 text-left">مستحق</th>
            <th className="p-2 text-left">سداد</th>
            <th className="p-2 text-left">الرصيد</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b">
              <td className="p-2">{formatDate(r.date)}</td>
              <td className="p-2 font-mono text-xs" dir="ltr">{r.ref}</td>
              <td className="p-2">{r.desc}</td>
              <td className="p-2 text-left tabular-nums" dir="ltr">{r.debit > 0 ? formatCurrency(r.debit) : '—'}</td>
              <td className="p-2 text-left tabular-nums" dir="ltr">{r.credit > 0 ? formatCurrency(r.credit) : '—'}</td>
              <td className="p-2 text-left font-medium tabular-nums" dir="ltr">{formatCurrency(r.balance)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="p-3 text-center text-gray-500">لا توجد حركات.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
