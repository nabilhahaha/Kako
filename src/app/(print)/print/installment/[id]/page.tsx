import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PrintButton } from '@/components/print-button';
import { formatCurrency, formatDate } from '@/lib/utils';

interface Plan {
  id: string; reference: string | null; total_amount: number; down_payment: number; financed_amount: number;
  installment_count: number; frequency: string; start_date: string; status: string; contract_date: string | null;
  company_id: string | null;
  customer: { name: string; name_ar: string | null; code: string } | null;
  schedule: { seq_no: number; due_date: string; amount: number; paid_amount: number; status: string }[];
}

const ST: Record<string, string> = { due: 'مستحق', partial: 'سداد جزئي', paid: 'مسدد' };

export default async function InstallmentStatementPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;

  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_installment_plans')
    .select('id, reference, total_amount, down_payment, financed_amount, installment_count, frequency, start_date, status, contract_date, company_id, customer:erp_customers(name, name_ar, code), schedule:erp_installment_schedule(seq_no, due_date, amount, paid_amount, status)')
    .eq('id', id)
    .maybeSingle();
  if (!data) notFound();
  const plan = data as unknown as Plan;
  const schedule = [...(plan.schedule ?? [])].sort((a, b) => a.seq_no - b.seq_no);

  const { data: company } = plan.company_id
    ? await supabase.from('erp_companies').select('name, name_ar').eq('id', plan.company_id).maybeSingle()
    : { data: null };
  const co = company as { name: string; name_ar: string | null } | null;

  const totalPaid = schedule.reduce((s, r) => s + Number(r.paid_amount), 0);
  const totalDue = schedule.reduce((s, r) => s + Number(r.amount), 0);
  const remaining = totalDue - totalPaid;

  return (
    <div className="space-y-5 text-sm">
      <div className="mb-2 flex justify-end">
        <PrintButton label="طباعة كشف الأقساط" />
      </div>
      <div className="border-b pb-3 text-center">
        <h1 className="text-lg font-bold">{co?.name_ar || co?.name || 'الشركة'}</h1>
        <h2 className="mt-1 text-base font-bold">كشف الأقساط</h2>
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        <span>العميل: <b>{plan.customer ? plan.customer.name_ar || plan.customer.name : '—'}</b></span>
        {plan.reference ? <span>المرجع: <b dir="ltr">{plan.reference}</b></span> : null}
        {plan.contract_date ? <span>تاريخ العقد: <b dir="ltr">{formatDate(plan.contract_date)}</b></span> : null}
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        <span>إجمالي العقد: <b dir="ltr">{formatCurrency(plan.total_amount)}</b></span>
        <span>الممول: <b dir="ltr">{formatCurrency(plan.financed_amount)}</b></span>
        <span>المتبقي: <b dir="ltr">{formatCurrency(remaining)}</b></span>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y bg-gray-100">
            <th className="p-2 text-right">القسط</th>
            <th className="p-2 text-right">تاريخ الاستحقاق</th>
            <th className="p-2 text-left">القيمة</th>
            <th className="p-2 text-left">المسدد</th>
            <th className="p-2 text-left">المتبقي</th>
            <th className="p-2 text-right">الحالة</th>
          </tr>
        </thead>
        <tbody>
          {schedule.map((r) => (
            <tr key={r.seq_no} className="border-b">
              <td className="p-2" dir="ltr">{r.seq_no}</td>
              <td className="p-2" dir="ltr">{formatDate(r.due_date)}</td>
              <td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(r.amount)}</td>
              <td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(r.paid_amount)}</td>
              <td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(Number(r.amount) - Number(r.paid_amount))}</td>
              <td className="p-2">{ST[r.status] ?? r.status}</td>
            </tr>
          ))}
          {schedule.length === 0 && (
            <tr><td colSpan={6} className="p-3 text-center text-gray-500">لا توجد أقساط.</td></tr>
          )}
        </tbody>
        <tfoot className="border-t-2 font-bold">
          <tr>
            <td className="p-2 text-right" colSpan={2}>الإجمالي</td>
            <td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(totalDue)}</td>
            <td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(totalPaid)}</td>
            <td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(remaining)}</td>
            <td className="p-2" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
