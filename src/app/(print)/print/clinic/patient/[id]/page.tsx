import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PrintButton } from '@/components/print-button';
import { formatCurrency, formatDate, ageFromBirthDate } from '@/lib/utils';
import type { Profile } from '@/lib/erp/types';

interface PatientRow {
  id: string; code: string | null; name: string; phone: string | null;
  gender: string | null; birth_date: string | null; blood_type: string | null;
  allergies: string | null; notes: string | null;
}
interface VisitRow {
  id: string; visit_date: string; visit_type: string; complaint: string | null;
  diagnosis: string | null; prescription: string | null; tests: string | null;
  fee: number; paid_amount: number; status: string; doctor_id: string | null;
  temperature: number | null; blood_pressure: string | null; pulse: number | null;
  weight: number | null; height: number | null; followup_date: string | null;
}

const TYPE: Record<string, string> = { consultation: 'كشف', followup: 'متابعة', procedure: 'إجراء' };

/** Full medical-record print for a single patient — the whole history, or a
 *  clear "no record yet" note for a new patient. Arabic by design (print doc). */
export default async function PatientRecordPrint({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;

  const supabase = await createClient();
  const { data: patient } = await supabase
    .from('erp_patients')
    .select('id, code, name, phone, gender, birth_date, blood_type, allergies, notes')
    .eq('id', id)
    .maybeSingle();
  if (!patient) notFound();
  const p = patient as PatientRow;

  const { data: visitsData } = await supabase
    .from('erp_clinic_visits')
    .select('id, visit_date, visit_type, complaint, diagnosis, prescription, tests, fee, paid_amount, status, doctor_id, temperature, blood_pressure, pulse, weight, height, followup_date')
    .eq('patient_id', id)
    .order('visit_date', { ascending: false })
    .limit(500);
  const visits = ((visitsData as VisitRow[]) ?? []).filter((v) => v.status !== 'cancelled');

  // Resolve doctor names in one query.
  const doctorIds = [...new Set(visits.map((v) => v.doctor_id).filter(Boolean))] as string[];
  const docNames = new Map<string, string>();
  if (doctorIds.length > 0) {
    const { data: docs } = await supabase.from('erp_profiles').select('id, full_name, email').in('id', doctorIds);
    for (const d of (docs as Pick<Profile, 'id' | 'full_name' | 'email'>[]) ?? []) {
      docNames.set(d.id, d.full_name || d.email || '');
    }
  }

  const clinicName = ctx.company?.name_ar || ctx.company?.name || 'العيادة';
  const age = ageFromBirthDate(p.birth_date);
  const totalBilled = visits.reduce((s, v) => s + Number(v.fee || 0), 0);
  const totalPaid = visits.reduce((s, v) => s + Number(v.paid_amount || 0), 0);
  const outstanding = Math.max(0, totalBilled - totalPaid);

  const vitalsOf = (v: VisitRow) =>
    [
      v.temperature != null ? `حرارة ${v.temperature}°` : null,
      v.blood_pressure ? `ضغط ${v.blood_pressure}` : null,
      v.pulse != null ? `نبض ${v.pulse}` : null,
      v.weight != null ? `وزن ${v.weight}كجم` : null,
      v.height != null ? `طول ${v.height}سم` : null,
    ].filter(Boolean) as string[];

  return (
    <div className="space-y-5 text-sm">
      <div className="mb-2 flex justify-end">
        <PrintButton label="طباعة الملف الطبي" />
      </div>

      {/* Clinic header */}
      <div className="border-b pb-3 text-center">
        <h1 className="text-xl font-bold">{clinicName}</h1>
        {ctx.company?.address && <p className="text-xs text-gray-600">{ctx.company.address}</p>}
        {ctx.company?.phone && <p className="text-xs text-gray-600" dir="ltr">{ctx.company.phone}</p>}
        <p className="mt-1 font-semibold">الملف الطبي للمريض</p>
      </div>

      {/* Patient meta */}
      <div className="grid grid-cols-2 gap-2">
        <div><span className="text-gray-500">المريض: </span><b>{p.name}</b></div>
        {p.code && <div className="text-left"><span className="text-gray-500">كود الملف: </span><span dir="ltr">{p.code}</span></div>}
        <div>
          {p.gender && <>{p.gender === 'male' ? 'ذكر' : 'أنثى'}</>}
          {age != null && <> · {age} سنة</>}
          {p.blood_type && <> · فصيلة {p.blood_type}</>}
        </div>
        {p.phone && <div className="text-left"><span className="text-gray-500">الهاتف: </span><span dir="ltr">{p.phone}</span></div>}
      </div>

      {p.allergies && (
        <div className="rounded-md border border-red-300 bg-red-50 p-2 text-red-700">
          <span className="font-bold">⚠ حساسية / أمراض مزمنة: </span>{p.allergies}
        </div>
      )}
      {p.notes && (
        <div className="rounded-md border p-2"><span className="text-gray-500">ملاحظات: </span>{p.notes}</div>
      )}

      {/* History */}
      {visits.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-gray-500">
          لا يوجد تاريخ طبي مسجل لهذا المريض.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between border-y py-2 font-semibold">
            <span>السجل الطبي ({visits.length} زيارة)</span>
          </div>

          <div className="space-y-3">
            {visits.map((v) => {
              const vitals = vitalsOf(v);
              const remaining = Math.max(0, Number(v.fee || 0) - Number(v.paid_amount || 0));
              return (
                <div key={v.id} className="break-inside-avoid rounded-md border p-3">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2 border-b pb-1">
                    <span className="font-bold" dir="ltr">{formatDate(v.visit_date)}</span>
                    <span className="text-gray-600">
                      {TYPE[v.visit_type] ?? v.visit_type}
                      {v.doctor_id && docNames.get(v.doctor_id) ? <> · {docNames.get(v.doctor_id)}</> : null}
                    </span>
                  </div>

                  {vitals.length > 0 && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 py-1 text-xs text-gray-600" dir="ltr">
                      {vitals.map((tt, i) => <span key={i}>{tt}</span>)}
                    </div>
                  )}
                  {v.complaint && <div><span className="text-gray-500">الشكوى: </span>{v.complaint}</div>}
                  {v.diagnosis && <div><span className="text-gray-500">التشخيص: </span>{v.diagnosis}</div>}
                  {v.prescription && (
                    <div className="mt-1">
                      <span className="text-gray-500">الروشتة: </span>
                      <ul className="list-disc space-y-0.5 pr-5">
                        {v.prescription.split('\n').map((line, i) => line.trim() && <li key={i}>{line}</li>)}
                      </ul>
                    </div>
                  )}
                  {v.tests && (
                    <div className="mt-1">
                      <span className="text-gray-500">تحاليل / أشعة: </span>
                      <ul className="list-disc space-y-0.5 pr-5">
                        {v.tests.split('\n').map((line, i) => line.trim() && <li key={i}>{line}</li>)}
                      </ul>
                    </div>
                  )}
                  {v.followup_date && (
                    <div className="mt-1 text-xs">موعد المتابعة: <span dir="ltr">{formatDate(v.followup_date)}</span></div>
                  )}
                  <div className="mt-1 text-xs text-gray-500" dir="ltr">
                    {formatCurrency(v.fee)} · مدفوع {formatCurrency(v.paid_amount)}
                    {remaining > 0 && <> · متبقٍ {formatCurrency(remaining)}</>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Account summary */}
          <table className="w-full border-collapse text-sm">
            <tbody>
              <tr className="border-y bg-gray-100">
                <td className="p-2 font-medium">إجمالي الرسوم</td>
                <td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(totalBilled)}</td>
              </tr>
              <tr className="border-b">
                <td className="p-2">إجمالي المدفوع</td>
                <td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(totalPaid)}</td>
              </tr>
              {outstanding > 0 && (
                <tr className="border-b font-bold">
                  <td className="p-2">إجمالي المتبقي</td>
                  <td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(outstanding)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}

      <p className="pt-4 text-center text-xs text-gray-500">
        تاريخ الطباعة: <span dir="ltr">{formatDate(new Date().toISOString())}</span> · {clinicName}
      </p>
    </div>
  );
}
