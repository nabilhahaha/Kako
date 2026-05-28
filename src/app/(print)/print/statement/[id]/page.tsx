import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PrintButton } from '@/components/print-button';
import { PAYMENT_METHOD_LABELS } from '@/lib/erp/constants';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { ErpCustomer, Invoice, Payment, PaymentMethod } from '@/lib/erp/types';

interface Entry {
  date: string;
  ref: string;
  desc: string;
  debit: number;
  credit: number;
}

export default async function StatementPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;

  const supabase = await createClient();
  const { data: customer } = await supabase
    .from('erp_customers')
    .select('*, branch:erp_branches(name, name_ar, company:erp_companies(name, name_ar))')
    .eq('id', id)
    .maybeSingle();
  if (!customer) notFound();
  const c = customer as unknown as ErpCustomer & {
    branch: { company: { name: string; name_ar: string | null } | null } | null;
  };

  const { data: invoices } = await supabase
    .from('erp_invoices')
    .select('id, invoice_number, net_amount, created_at, status')
    .eq('customer_id', id)
    .neq('status', 'draft')
    .neq('status', 'cancelled');
  const invList = (invoices as Pick<Invoice, 'id' | 'invoice_number' | 'net_amount' | 'created_at'>[]) ?? [];
  const invoiceIds = invList.map((i) => i.id);

  let payments: Array<Pick<Payment, 'amount' | 'payment_method' | 'payment_date' | 'invoice_id'>> = [];
  if (invoiceIds.length > 0) {
    const { data } = await supabase
      .from('erp_payments')
      .select('amount, payment_method, payment_date, invoice_id')
      .in('invoice_id', invoiceIds);
    payments = data ?? [];
  }
  const numById = new Map(invList.map((i) => [i.id, i.invoice_number]));

  const entries: Entry[] = [
    ...invList.map((i) => ({ date: i.created_at, ref: i.invoice_number, desc: 'فاتورة', debit: Number(i.net_amount), credit: 0 })),
    ...payments.map((p) => ({
      date: p.payment_date,
      ref: numById.get(p.invoice_id) ?? '—',
      desc: `تحصيل (${PAYMENT_METHOD_LABELS[p.payment_method as PaymentMethod]?.ar ?? ''})`,
      debit: 0,
      credit: Number(p.amount),
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let running = 0;
  const rows = entries.map((e) => {
    running += e.debit - e.credit;
    return { ...e, balance: running };
  });
  const company = c.branch?.company;

  return (
    <div className="space-y-5 text-sm">
      <div className="mb-2 flex justify-end">
        <PrintButton label="طباعة كشف الحساب" />
      </div>
      <div className="border-b pb-3 text-center">
        <h1 className="text-lg font-bold">{company?.name_ar || company?.name || 'الشركة'}</h1>
        <h2 className="mt-1 text-base font-bold">كشف حساب عميل</h2>
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        <span>العميل: <b>{c.name_ar || c.name}</b></span>
        <span>الكود: <b dir="ltr">{c.code}</b></span>
        <span>الرصيد الحالي: <b dir="ltr">{formatCurrency(c.balance)}</b></span>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y bg-gray-100">
            <th className="p-2 text-right">التاريخ</th>
            <th className="p-2 text-right">المرجع</th>
            <th className="p-2 text-right">البيان</th>
            <th className="p-2 text-left">مدين</th>
            <th className="p-2 text-left">دائن</th>
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
