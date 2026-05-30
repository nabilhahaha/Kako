import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { requireAnyPermission } from '@/lib/erp/guards';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { formatCurrency, formatDate, ageFromBirthDate } from '@/lib/utils';
import { getT } from '@/lib/i18n/server';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { ArrowRight, Printer, Stethoscope, CalendarClock, AlertTriangle, Plus, Thermometer, Activity, HeartPulse, Weight, CalendarCheck, LineChart as LineChartIcon } from 'lucide-react';
import { VitalsTrend, type VitalsPoint } from './vitals-trend';
import { type DoctorOption, doctorName } from '../../clinical-ui';

interface Patient {
  id: string; code: string | null; name: string; phone: string | null;
  gender: string | null; birth_date: string | null; blood_type: string | null;
  allergies: string | null; notes: string | null;
}
interface VisitRow {
  id: string; visit_date: string; visit_type: string; complaint: string | null;
  diagnosis: string | null; prescription: string | null; tests: string | null; fee: number; paid_amount: number; status: string;
  doctor_id: string | null;
  temperature: number | null; blood_pressure: string | null; pulse: number | null;
  weight: number | null; height: number | null; followup_date: string | null;
}
interface ApptRow { id: string; scheduled_at: string; reason: string | null; status: string }

function hasVitals(v: VisitRow) {
  return v.temperature != null || v.blood_pressure || v.pulse != null || v.weight != null || v.height != null;
}

export default async function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAnyPermission(['clinic.manage', 'clinic.reception', 'clinic.doctor']);
  const { t, locale } = await getT();
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

  const [{ data: visits }, { data: appts }, { data: doctorsData }] = await Promise.all([
    supabase
      .from('erp_clinic_visits')
      .select('id, visit_date, visit_type, complaint, diagnosis, prescription, tests, fee, paid_amount, status, doctor_id, temperature, blood_pressure, pulse, weight, height, followup_date')
      .eq('patient_id', id)
      .order('visit_date', { ascending: false })
      .limit(200),
    supabase
      .from('erp_clinic_appointments')
      .select('id, scheduled_at, reason, status')
      .eq('patient_id', id)
      .order('scheduled_at', { ascending: false })
      .limit(50),
    supabase.rpc('erp_clinic_doctors'),
  ]);

  const doctors = (doctorsData as DoctorOption[]) ?? [];
  const visitList = (visits as VisitRow[]) ?? [];
  const apptList = (appts as ApptRow[]) ?? [];
  const billable = visitList.filter((v) => v.status !== 'cancelled');
  const totalBilled = billable.reduce((s, v) => s + Number(v.fee || 0), 0);
  const totalPaid = billable.reduce((s, v) => s + Number(v.paid_amount || 0), 0);
  const outstanding = Math.max(0, totalBilled - totalPaid);
  const age = ageFromBirthDate(p.birth_date);

  const VISIT_STATUS: Record<string, { label: string; variant: 'info' | 'warning' | 'success' | 'destructive' | 'secondary' }> = {
    waiting: { label: t('clinic.visitStatus.waiting'), variant: 'info' },
    in_progress: { label: t('clinic.visitStatus.in_progress'), variant: 'warning' },
    done: { label: t('clinic.visitStatus.done'), variant: 'success' },
    cancelled: { label: t('clinic.visitStatus.cancelled'), variant: 'destructive' },
  };
  const TYPE: Record<string, string> = {
    consultation: t('clinic.visitType.consultation'),
    followup: t('clinic.visitType.followup'),
    procedure: t('clinic.visitType.procedure'),
  };
  const APPT_STATUS: Record<string, string> = {
    scheduled: t('clinic.apptStatus.scheduled'),
    confirmed: t('clinic.apptStatus.confirmed'),
    arrived: t('clinic.apptStatus.arrived'),
    done: t('clinic.apptStatus.done'),
    cancelled: t('clinic.apptStatus.cancelled'),
    no_show: t('clinic.apptStatus.no_show'),
  };

  const lastVisit = billable[0] ?? null;
  const now = Date.now();
  const nextAppt = [...apptList]
    .filter((a) => (a.status === 'scheduled' || a.status === 'confirmed') && new Date(a.scheduled_at).getTime() >= now)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0] ?? null;

  const apptFmt = new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const shortFmt = new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: 'numeric', month: 'short' });

  // Vital-sign trend points (oldest → newest), for the mini charts.
  const trendPoints: VitalsPoint[] = [...billable]
    .reverse()
    .map((v) => {
      const sys = v.blood_pressure ? parseInt(v.blood_pressure.split('/')[0], 10) : NaN;
      return {
        date: shortFmt.format(new Date(v.visit_date)),
        weight: v.weight ?? null,
        pulse: v.pulse ?? null,
        temperature: v.temperature ?? null,
        systolic: Number.isFinite(sys) ? sys : null,
      };
    });

  const meta = [
    p.code ? t('clinic.patientDetail.patientCodePrefix', { code: p.code }) : null,
    age != null ? t('clinic.patientDetail.ageSuffix', { age }) : null,
    p.gender === 'male' ? t('clinic.patientDetail.genderMale') : p.gender === 'female' ? t('clinic.patientDetail.genderFemale') : null,
    p.phone || null,
    p.blood_type ? t('clinic.patientDetail.bloodTypePrefix', { type: p.blood_type }) : null,
  ].filter(Boolean).join(' · ');

  return (
    <div>
      <Link href="/clinic/patients" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="h-4 w-4" /> {t('clinic.patientDetail.backLink')}
      </Link>
      <PageHeader
        title={p.name}
        description={meta || undefined}
        action={
          <div className="flex gap-2">
            <Link href={`/clinic/visits?patient=${p.id}`} className={buttonVariants({ size: 'sm' })}>
              <Plus className="h-4 w-4" /> {t('clinic.patientDetail.newVisitButton')}
            </Link>
            <Link href={`/clinic/appointments?patient=${p.id}`} className={buttonVariants({ size: 'sm', variant: 'outline' })}>
              <CalendarClock className="h-4 w-4" /> {t('clinic.patientDetail.bookAppointmentButton')}
            </Link>
          </div>
        }
      />

      {/* Medical alert: allergies & chronic conditions */}
      {p.allergies && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span><span className="font-semibold">{t('clinic.patientDetail.allergiesLabel')}</span>{p.allergies}</span>
        </div>
      )}
      {p.notes && (
        <div className="mb-4 rounded-md border bg-card p-3 text-sm">
          <span className="text-muted-foreground">{t('clinic.patientDetail.notesLabel')}</span>{p.notes}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Summary label={t('clinic.patientDetail.summaryVisitsCount')} value={String(billable.length)} />
        <Summary label={t('clinic.patientDetail.summaryTotalFee')} value={formatCurrency(totalBilled, 'EGP', INTL_LOCALE[locale])} />
        <Summary label={t('clinic.patientDetail.summaryPaid')} value={formatCurrency(totalPaid, 'EGP', INTL_LOCALE[locale])} tone="ok" />
        <Summary label={t('clinic.patientDetail.summaryOutstanding')} value={formatCurrency(outstanding, 'EGP', INTL_LOCALE[locale])} tone={outstanding > 0 ? 'warn' : 'ok'} />
      </div>

      {(lastVisit || nextAppt) && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Stethoscope className="h-5 w-5" /></div>
              <div>
                <p className="text-xs text-muted-foreground">{t('clinic.patientDetail.lastVisitLabel')}</p>
                <p className="text-sm font-medium">{lastVisit ? `${formatDate(lastVisit.visit_date, INTL_LOCALE[locale])}${lastVisit.diagnosis ? ' — ' + lastVisit.diagnosis : ''}` : t('clinic.patientDetail.lastVisitNone')}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10 text-info"><CalendarCheck className="h-5 w-5" /></div>
              <div>
                <p className="text-xs text-muted-foreground">{t('clinic.patientDetail.nextApptLabel')}</p>
                <p className="text-sm font-medium" dir="ltr">{nextAppt ? apptFmt.format(new Date(nextAppt.scheduled_at)) : t('clinic.patientDetail.nextApptNone')}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {trendPoints.length >= 2 && (
        <div className="mb-6">
          <h2 className="mb-2 flex items-center gap-2 font-semibold">
            <LineChartIcon className="h-4 w-4" /> {t('clinic.patientDetail.vitalsTrendTitle')}
          </h2>
          <VitalsTrend points={trendPoints} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-2 flex items-center gap-2 font-semibold">
            <Stethoscope className="h-4 w-4" /> {t('clinic.patientDetail.medicalRecordTitle', { count: visitList.length })}
          </h2>
          {visitList.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{t('clinic.patientDetail.emptyVisits')}</CardContent></Card>
          ) : (
            <ol className="relative space-y-3 border-s-2 border-border ps-4">
              {visitList.map((v) => {
                const st = VISIT_STATUS[v.status] ?? { label: v.status, variant: 'secondary' as const };
                const remaining = Number(v.fee || 0) - Number(v.paid_amount || 0);
                return (
                  <li key={v.id} className="relative">
                    <span className="absolute -right-[1.32rem] top-3 h-3 w-3 rounded-full border-2 border-background bg-primary" />
                    <Card>
                      <CardContent className="space-y-2 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium" dir="ltr">{formatDate(v.visit_date, INTL_LOCALE[locale])}</span>
                            <Badge variant="outline">{TYPE[v.visit_type] ?? v.visit_type}</Badge>
                            <Badge variant={st.variant}>{st.label}</Badge>
                            {v.doctor_id && <span className="text-xs text-muted-foreground">{t('clinic.patientDetail.doctorPrefix')} {doctorName(doctors, v.doctor_id)}</span>}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm tabular-nums" dir="ltr">
                              {formatCurrency(v.fee, 'EGP', INTL_LOCALE[locale])}
                              {remaining > 0 && v.fee > 0 && <span className="text-destructive"> ({t('clinic.patientDetail.remainingFee', { amount: formatCurrency(remaining, 'EGP', INTL_LOCALE[locale]) })})</span>}
                            </span>
                            {v.status === 'done' && (
                              <Link href={`/print/clinic/visit/${v.id}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                                <Printer className="h-3.5 w-3.5" /> {t('clinic.patientDetail.printButton')}
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

                        {v.complaint && <p className="text-sm"><span className="text-muted-foreground">{t('clinic.patientDetail.complaintLabel')}</span>{v.complaint}</p>}
                        {v.diagnosis && <p className="text-sm"><span className="text-muted-foreground">{t('clinic.patientDetail.diagnosisLabel')}</span>{v.diagnosis}</p>}
                        {v.prescription && (
                          <div className="rounded-md bg-secondary/40 p-2 text-sm">
                            <span className="text-muted-foreground">{t('clinic.patientDetail.prescriptionLabel')}</span>
                            <ul className="mt-1 list-disc space-y-0.5 ps-5">
                              {v.prescription.split('\n').map((line, i) => line.trim() && <li key={i}>{line}</li>)}
                            </ul>
                          </div>
                        )}
                        {v.tests && (
                          <div className="rounded-md border border-info/40 bg-info/10 p-2 text-sm">
                            <span className="text-muted-foreground">{t('clinic.patientDetail.testsLabel')}</span>
                            <ul className="mt-1 list-disc space-y-0.5 ps-5">
                              {v.tests.split('\n').map((line, i) => line.trim() && <li key={i}>{line}</li>)}
                            </ul>
                          </div>
                        )}
                        {v.followup_date && (
                          <p className="text-xs text-info">{t('clinic.patientDetail.followupLabel')}<span dir="ltr">{formatDate(v.followup_date, INTL_LOCALE[locale])}</span></p>
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
            <CalendarClock className="h-4 w-4" /> {t('clinic.patientDetail.appointmentsTitle')}
          </h2>
          {apptList.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{t('clinic.patientDetail.emptyAppointments')}</CardContent></Card>
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
