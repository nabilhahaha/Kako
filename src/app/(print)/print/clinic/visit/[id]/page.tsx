import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PrintButton } from '@/components/print-button';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Profile } from '@/lib/erp/types';

interface VisitRow {
  id: string; visit_date: string; visit_type: string; complaint: string | null;
  diagnosis: string | null; prescription: string | null; fee: number; paid_amount: number;
  doctor_id: string | null;
  patient: { name: string; phone: string | null; gender: string | null; code: string | null } | null;
}

const TYPE: Record<string, string> = { consultation: 'كشف', followup: 'متابعة', procedure: 'إجراء' };

export default async function ClinicVisitPrint({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;

  const supabase = await createClient();
  const { data: visit } = await supabase
    .from('erp_clinic_visits')
    .select('id, visit_date, visit_type, complaint, diagnosis, prescription, fee, paid_amount, doctor_id, patient:erp_patients(name, phone, gender, code)')
    .eq('id', id)
    .maybeSingle();
  if (!visit) notFound();
  const v = visit as unknown as VisitRow;

  let doctorName = '';
  if (v.doctor_id) {
    const { data: doc } = await supabase.from('erp_profiles').select('full_name, email').eq('id', v.doctor_id).maybeSingle();
    const d = doc as Pick<Profile, 'full_name' | 'email'> | null;
    doctorName = d?.full_name || d?.email || '';
  }

  const clinicName = ctx.company?.name_ar || ctx.company?.name || 'العيادة';
  const remaining = Math.max(0, Number(v.fee || 0) - Number(v.paid_amount || 0));

  return (
    <div className="space-y-5 text-sm">
      <div className="mb-2 flex justify-end">
        <PrintButton label="طباعة الروشتة" />
      </div>

      {/* Clinic header */}
      <div className="border-b pb-3 text-center">
        <h1 className="text-xl font-bold">{clinicName}</h1>
        {ctx.company?.address && <p className="text-xs text-gray-600">{ctx.company.address}</p>}
        {ctx.company?.phone && <p className="text-xs text-gray-600" dir="ltr">{ctx.company.phone}</p>}
      </div>

      {/* Patient + visit meta */}
      <div className="grid grid-cols-2 gap-2">
        <div><span className="text-gray-500">المريض: </span><b>{v.patient?.name ?? '—'}</b></div>
        <div className="text-left"><span className="text-gray-500">التاريخ: </span><b dir="ltr">{formatDate(v.visit_date)}</b></div>
        <div>
          <span className="text-gray-500">النوع: </span>{TYPE[v.visit_type] ?? v.visit_type}
          {v.patient?.gender && <> · {v.patient.gender === 'male' ? 'ذكر' : 'أنثى'}</>}
        </div>
        <div className="text-left">{doctorName && <><span className="text-gray-500">الطبيب: </span>{doctorName}</>}</div>
        {v.patient?.phone && <div><span className="text-gray-500">الهاتف: </span><span dir="ltr">{v.patient.phone}</span></div>}
        {v.patient?.code && <div className="text-left"><span className="text-gray-500">كود الملف: </span><span dir="ltr">{v.patient.code}</span></div>}
      </div>

      {v.complaint && (
        <div><span className="text-gray-500">الشكوى: </span>{v.complaint}</div>
      )}
      {v.diagnosis && (
        <div><span className="text-gray-500">التشخيص: </span>{v.diagnosis}</div>
      )}

      {/* Prescription — the main body (Rx) */}
      <div className="min-h-[180px] rounded-md border p-3">
        <div className="mb-1 flex items-center gap-2 font-bold">
          <span className="font-serif text-2xl leading-none">℞</span> الروشتة
        </div>
        <p className="whitespace-pre-wrap leading-7">{v.prescription || '—'}</p>
      </div>

      {/* Fee receipt */}
      <table className="w-full border-collapse text-sm">
        <tbody>
          <tr className="border-y bg-gray-100">
            <td className="p-2 font-medium">رسوم الكشف</td>
            <td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(v.fee)}</td>
          </tr>
          <tr className="border-b">
            <td className="p-2">المدفوع</td>
            <td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(v.paid_amount)}</td>
          </tr>
          {remaining > 0 && (
            <tr className="border-b font-bold">
              <td className="p-2">المتبقي</td>
              <td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(remaining)}</td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="pt-4 text-center text-xs text-gray-500">نتمنى لكم دوام الصحة والعافية</p>
    </div>
  );
}
