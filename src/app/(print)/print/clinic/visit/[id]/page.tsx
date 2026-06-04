import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PrintButton } from '@/components/print-button';
import { formatCurrency, formatDate, ageFromBirthDate } from '@/lib/utils';
import type { Profile } from '@/lib/erp/types';

interface VisitRow {
  id: string; visit_date: string; visit_type: string; complaint: string | null;
  diagnosis: string | null; prescription: string | null; tests: string | null; fee: number; paid_amount: number;
  doctor_id: string | null;
  temperature: number | null; blood_pressure: string | null; pulse: number | null;
  weight: number | null; height: number | null; followup_date: string | null;
  patient: { name: string; phone: string | null; gender: string | null; code: string | null; birth_date: string | null; allergies: string | null } | null;
}

const TYPE: Record<string, string> = { consultation: 'كشف', followup: 'متابعة', procedure: 'إجراء' };

export default async function ClinicVisitPrint({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;

  const supabase = await createClient();
  const { data: visit } = await supabase
    .from('erp_clinic_visits')
    .select('id, visit_date, visit_type, complaint, diagnosis, prescription, tests, fee, paid_amount, doctor_id, temperature, blood_pressure, pulse, weight, height, followup_date, patient:erp_patients(name, phone, gender, code, birth_date, allergies)')
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
  const age = ageFromBirthDate(v.patient?.birth_date);
  const vitals = [
    v.temperature != null ? `حرارة ${v.temperature}°` : null,
    v.blood_pressure ? `ضغط ${v.blood_pressure}` : null,
    v.pulse != null ? `نبض ${v.pulse}` : null,
    v.weight != null ? `وزن ${v.weight}كجم` : null,
    v.height != null ? `طول ${v.height}سم` : null,
  ].filter(Boolean);

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
          {age != null && <> · {age} سنة</>}
        </div>
        <div className="text-left">{doctorName && <><span className="text-gray-500">الطبيب: </span>{doctorName}</>}</div>
        {v.patient?.phone && <div><span className="text-gray-500">الهاتف: </span><span dir="ltr">{v.patient.phone}</span></div>}
        {v.patient?.code && <div className="text-left"><span className="text-gray-500">كود الملف: </span><span dir="ltr">{v.patient.code}</span></div>}
      </div>

      {v.patient?.allergies && (
        <div className="rounded-md border border-red-300 bg-red-50 p-2 text-red-700">
          <span className="font-bold">⚠ حساسية / أمراض مزمنة: </span>{v.patient.allergies}
        </div>
      )}

      {vitals.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-y py-2 text-gray-700" dir="ltr">
          {vitals.map((t, i) => <span key={i}>{t}</span>)}
        </div>
      )}

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

      {/* Lab / radiology request sheet */}
      {v.tests && (
        <div className="rounded-md border p-3">
          <div className="mb-1 font-bold">طلب تحاليل / أشعة</div>
          <ul className="list-disc space-y-0.5 pr-5 leading-7">
            {v.tests.split('\n').map((line, i) => line.trim() && <li key={i}>{line}</li>)}
          </ul>
        </div>
      )}

      {v.followup_date && (
        <div className="font-medium">موعد المتابعة: <span dir="ltr">{formatDate(v.followup_date)}</span></div>
      )}

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
