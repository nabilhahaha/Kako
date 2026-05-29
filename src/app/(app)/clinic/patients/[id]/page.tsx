import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { formatCurrency, formatDate, ageFromBirthDate } from '@/lib/utils';
import { ArrowRight, Printer, Stethoscope, CalendarClock, AlertTriangle, Plus, Thermometer, Activity, HeartPulse, Weight, CalendarCheck } from 'lucide-react';

interface Patient {
  id: string; code: string | null; name: string; phone: string | null;
  gender: string | null; birth_date: string | null; blood_type: string | null;
  allergies: string | null; notes: string | null;
}
interface VisitRow {
  id: string; visit_date: string; visit_type: string; complaint: string | null;
  diagnosis: string | null; prescription: string | null; fee: number; paid_amount: number; status: string;
  temperature: number | null; blood_pressure: string | null; pulse: number | null;
  weight: number | null; height: number | null; followup_date: string | null;
}
interface ApptRow { id: string; scheduled_at: string; reason: string | null; status: string }

const VISIT_STATUS: Record<string, { label: string; variant: 'info' | 'warning' | 'success' | 'destructive' | 'secondary' }> = {
  waiting: { label: 'في الانتظار', variant: 'info' },
  in_progress: { label: 'جاري الكشف', variant: 'warning' },
  done: { label: 'تم', variant: 'success' },
  cancelled: { label: 'ملغي', variant: 'destructive' },
};
const TYPE: Record<string, string> = { consultation: 'كشف', followup: 'متابعة', procedure: 'إجراء' };
const APPT_STATUS: Record<string, string> = {
  scheduled: 'محجوز', confirmed: 'مؤكد', arrived: 'وصل', done: 'تم', cancelled: 'ملغي', no_show: 'لم يحضر',
};

function hasVitals(v: VisitRow) {
  return v.temperature != null || v.blood_pressure || v.pulse != null || v.weight != null || v.height != null;
}

export default async function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
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
  const p = patient as Patient;

  const [{ data: visits }, { data: appts }] = await Promise.all([
    supabase
      .from('erp_clinic_visits')
      .select('id, visit_date, visit_type, complaint, diagnosis, prescription, fee, paid_amount, status, temperature, blood_pressure, pulse, weight, height, followup_date')
      .eq('patient_id', id)
      .order('visit_date', { ascending: false })
      .limit(200),
    supabase
      .from('erp_clinic_appointments')
      .select('id, scheduled_at, reason, status')
      .eq('patient_id', id)
      .order('scheduled_at', { ascending: false })
      .limit(50),
  ]);

  const visitList = (visits as VisitRow[]) ?? [];
  const apptList = (appts as ApptRow[]) ?? [];
  const billable = visitList.filter((v) => v.status !== 'cancelled');
  const totalBilled = billable.reduce((s, v) => s + Number(v.fee || 0), 0);
  const totalPaid = billable.reduce((s, v) => s + Number(v.paid_amount || 0), 0);
  const outstanding = Math.max(0, totalBilled - totalPaid);
  const age = ageFromBirthDate(p.birth_date);

  const lastVisit = billable[0] ?? null;
  const now = Date.now();
  const nextAppt = [...apptList]
    .filter((a) => (a.status === 'scheduled' || a.status === 'confirmed') && new Date(a.scheduled_at).getTime() >= now)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0] ?? null;

  const apptFmt = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const meta = [
    p.code ? `كود ${p.code}` : null,
    age != null ? `${age} سنة` : null,
    p.gender === 'male' ? 'ذكر' : p.gender === 'female' ? 'أنثى' : null,
    p.phone || null,
    p.blood_type ? `فصيلة ${p.blood_type}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div>
      <Link href="/clinic/patients" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="h-4 w-4" /> المرضى
      </Link>
      <PageHeader
        title={p.name}
        description={meta || undefined}
        action={
          <div className="flex gap-2">
            <Link href={`/clinic/visits?patient=${p.id}`} className={buttonVariants({ size: 'sm' })}>
              <Plus className="h-4 w-4" /> كشف جديد
            </Link>
            <Link href={`/clinic/appointments?patient=${p.id}`} className={buttonVariants({ size: 'sm', variant: 'outline' })}>
              <CalendarClock className="h-4 w-4" /> حجز موعد
            </Link>
          </div>
        }
      />

      {/* Medical alert: allergies & chronic conditions */}
      {p.allergies && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span><span className="font-semibold">حساسية / أمراض مزمنة: </span>{p.allergies}</span>
        </div>
      )}
      {p.notes && (
        <div className="mb-4 rounded-md border bg-card p-3 text-sm">
          <span className="text-muted-foreground">ملاحظات: </span>{p.notes}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Summary label="عدد الكشوفات" value={String(billable.length)} />
        <Summary label="إجمالي الرسوم" value={formatCurrency(totalBilled)} />
        <Summary label="المحصّل" value={formatCurrency(totalPaid)} tone="ok" />
        <Summary label="المتبقي" value={formatCurrency(outstanding)} tone={outstanding > 0 ? 'warn' : 'ok'} />
      </div>

      {(lastVisit || nextAppt) && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Stethoscope className="h-5 w-5" /></div>
              <div>
                <p className="text-xs text-muted-foreground">آخر زيارة</p>
                <p className="text-sm font-medium">{lastVisit ? `${formatDate(lastVisit.visit_date)}${lastVisit.diagnosis ? ' — ' + lastVisit.diagnosis : ''}` : 'لا يوجد'}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10 text-info"><CalendarCheck className="h-5 w-5" /></div>
              <div>
                <p className="text-xs text-muted-foreground">الموعد القادم</p>
                <p className="text-sm font-medium" dir="ltr">{nextAppt ? apptFmt.format(new Date(nextAppt.scheduled_at)) : 'لا يوجد'}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-2 flex items-center gap-2 font-semibold">
            <Stethoscope className="h-4 w-4" /> السجل الطبي ({visitList.length})
          </h2>
          {visitList.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">لا توجد كشوفات سابقة لهذا المريض.</CardContent></Card>
          ) : (
            <ol className="relative space-y-3 border-r-2 border-border pr-4">
              {visitList.map((v) => {
                const st = VISIT_STATUS[v.status] ?? { label: v.status, variant: 'secondary' as const };
                const remaining = Number(v.fee || 0) - Number(v.paid_amount || 0);
                return (
                  <li key={v.id} className="relative">
                    <span className="absolute -right-[1.32rem] top-3 h-3 w-3 rounded-full border-2 border-background bg-primary" />
                    <Card>
                      <CardContent className="space-y-2 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium" dir="ltr">{formatDate(v.visit_date)}</span>
                            <Badge variant="outline">{TYPE[v.visit_type] ?? v.visit_type}</Badge>
                            <Badge variant={st.variant}>{st.label}</Badge>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm tabular-nums" dir="ltr">
                              {formatCurrency(v.fee)}
                              {remaining > 0 && v.fee > 0 && <span className="text-destructive"> (باقي {formatCurrency(remaining)})</span>}
                            </span>
                            {v.status === 'done' && (
                              <Link href={`/print/clinic/visit/${v.id}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                                <Printer className="h-3.5 w-3.5" /> طباعة
                              </Link>
                            )}
                          </div>
                        </div>

                        {hasVitals(v) && (
                          <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-md bg-secondary/40 px-2 py-1.5 text-xs text-muted-foreground" dir="ltr">
                            {v.temperature != null && <span className="inline-flex items-center gap-1"><Thermometer className="h-3 w-3" /> {v.temperature}°</span>}
                            {v.blood_pressure && <span className="inline-flex items-center gap-1"><Activity className="h-3 w-3" /> {v.blood_pressure}</span>}
                            {v.pulse != null && <span className="inline-flex items-center gap-1"><HeartPulse className="h-3 w-3" /> {v.pulse}</span>}
                            {v.weight != null && <span className="inline-flex items-center gap-1"><Weight className="h-3 w-3" /> {v.weight}kg</span>}
                            {v.height != null && <span>{v.height}cm</span>}
                          </div>
                        )}

                        {v.complaint && <p className="text-sm"><span className="text-muted-foreground">الشكوى: </span>{v.complaint}</p>}
                        {v.diagnosis && <p className="text-sm"><span className="text-muted-foreground">التشخيص: </span>{v.diagnosis}</p>}
                        {v.prescription && (
                          <div className="rounded-md bg-secondary/40 p-2 text-sm">
                            <span className="text-muted-foreground">الروشتة:</span>
                            <p className="whitespace-pre-wrap">{v.prescription}</p>
                          </div>
                        )}
                        {v.followup_date && (
                          <p className="text-xs text-info">متابعة في: <span dir="ltr">{formatDate(v.followup_date)}</span></p>
                        )}
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div>
          <h2 className="mb-2 flex items-center gap-2 font-semibold">
            <CalendarClock className="h-4 w-4" /> المواعيد
          </h2>
          {apptList.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">لا توجد مواعيد.</CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {apptList.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                      <div className="min-w-0">
                        <p className="tabular-nums" dir="ltr">{apptFmt.format(new Date(a.scheduled_at))}</p>
                        {a.reason && <p className="truncate text-xs text-muted-foreground">{a.reason}</p>}
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{APPT_STATUS[a.status] ?? a.status}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'ok' }) {
  const cls = tone === 'warn' ? 'text-warning' : tone === 'ok' ? 'text-success' : '';
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold tabular-nums ${cls}`} dir="ltr">{value}</p>
      </CardContent>
    </Card>
  );
}
