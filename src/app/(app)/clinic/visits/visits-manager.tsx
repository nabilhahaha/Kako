'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2, X, Stethoscope, CheckCircle2, Printer, Play, Clock, ClipboardList, FileText, Activity, Pill, FlaskConical, CalendarClock } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { usePrompt } from '@/components/prompt-dialog';
import { useConfirm } from '@/components/confirm-dialog';
import { createVisit, updateVisit, setVisitStatus, recordVisitPayment } from '../actions';
import { formPayload } from '@/lib/sync/web/write-seam';
import { submitOffline } from '@/lib/sync/web/submit-offline';
import {
  type ClinicVisit as Visit,
  type PatientOption,
  type DoctorOption,
  type ServiceOption,
  doctorName,
  ServicePicker,
  selectCls,
  taCls,
  VitalsFields,
  VitalsLine,
} from '../clinical-ui';
import { ClinicalListField } from '../clinical-list-field';
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';

export type { ClinicVisit as Visit, PatientOption } from '../clinical-ui';

export function VisitsManager({
  visits,
  patients,
  doctors,
  services,
  initialPatientId,
}: {
  visits: Visit[];
  patients: PatientOption[];
  doctors: DoctorOption[];
  services: ServiceOption[];
  initialPatientId?: string | null;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const prompt = usePrompt();
  const [adding, setAdding] = useState(false);
  const [exam, setExam] = useState<Visit | null>(null);
  const [pending, startTransition] = useTransition();

  // Deep-link from a patient file (?patient=…) opens the new-visit form ready.
  useEffect(() => {
    if (initialPatientId && patients.some((p) => p.id === initialPatientId)) setAdding(true);
  }, [initialPatientId, patients]);

  const waiting = visits.filter((v) => v.status === 'waiting');
  const inProgress = visits.filter((v) => v.status === 'in_progress');
  const done = visits.filter((v) => v.status === 'done');

  const TYPE: Record<string, string> = {
    consultation: t('clinic.visitType.consultation'),
    followup: t('clinic.visitType.followup'),
    procedure: t('clinic.visitType.procedure'),
  };

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) { toast.error(res.error ?? t('clinic.visits.toastError')); return; }
      toast.success(ok);
      router.refresh();
    });
  }

  function submitForm(
    e: React.FormEvent<HTMLFormElement>,
    fn: (fd: FormData) => Promise<{ ok: boolean; error?: string; data?: unknown }>,
    ok: string,
    after: () => void,
  ) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await fn(fd);
      if (!res.ok) { toast.error(res.error ?? t('clinic.visits.toastError')); return; }
      toast.success(ok);
      after();
      router.refresh();
    });
  }

  // Registering a visit is offline-queue (hybrid policy): online → create + journal;
  // offline → journal a client-id visit locally and sync it on reconnect.
  function submitVisit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const localId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `local-${Date.now()}`;
    startTransition(async () => {
      const res = await submitOffline<{ id: string }>({
        action: () => createVisit(fd),
        mutation: (data) => ({ entity: 'visits', op: 'insert', pk: data?.id ?? localId, payload: formPayload(fd) }),
      });
      if (res.offline) { toast.success(t('common.offlineSaved')); setAdding(false); return; }
      if (!res.ok) { toast.error(res.error ?? t('clinic.visits.toastError')); return; }
      toast.success(t('clinic.visits.toastRegistered'));
      setAdding(false);
      router.refresh();
    });
  }

  function collect(v: Visit) {
    const remaining = v.fee - v.paid_amount;
    prompt({
      title: t('clinic.visits.collectTitle'),
      message: t('clinic.visits.collectMessage', { name: v.patient?.name ?? '', remaining: remaining.toLocaleString(INTL_LOCALE[locale]) }),
      label: t('clinic.visits.collectLabel'), type: 'number', defaultValue: remaining > 0 ? String(remaining) : '',
      confirmText: t('clinic.visits.collectConfirm'),
    }).then((raw) => {
      if (raw == null) return;
      const amt = Number(raw);
      if (!Number.isFinite(amt) || amt <= 0) { toast.error(t('clinic.visits.toastInvalidAmount')); return; }
      run(() => recordVisitPayment(v.id, amt), t('clinic.visits.toastPaymentRecorded'));
    });
  }

  return (
    <div className="space-y-4">
      {/* New visit */}
      <div>
        {!adding ? (
          <Button onClick={() => setAdding(true)} disabled={patients.length === 0}><Plus className="h-4 w-4" /> {t('clinic.visits.newButton')}</Button>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={submitVisit} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <Label>{t('clinic.visits.fieldPatient')}</Label>
                    <select name="patient_id" className={selectCls} required defaultValue={initialPatientId ?? ''}>
                      <option value="" disabled>{t('clinic.visits.patientPlaceholder')}</option>
                      {patients.map((p) => <option key={p.id} value={p.id}>{p.name}{p.phone ? ` — ${p.phone}` : ''}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>{t('clinic.visits.fieldDoctor')}</Label>
                    <select name="doctor_id" className={selectCls} defaultValue={doctors.length === 1 ? doctors[0].id : ''}>
                      <option value="">{t('clinic.visits.doctorPlaceholder')}</option>
                      {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name || d.email}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>{t('clinic.visits.fieldVisitType')}</Label>
                    <select name="visit_type" className={selectCls} defaultValue="consultation">
                      <option value="consultation">{t('clinic.visitType.consultation')}</option>
                      <option value="followup">{t('clinic.visitType.followup')}</option>
                      <option value="procedure">{t('clinic.visitType.procedure')}</option>
                    </select>
                  </div>
                  <ServicePicker services={services} />
                  <div className="space-y-1"><Label>{t('clinic.visits.fieldComplaint')}</Label><Input name="complaint" placeholder={t('clinic.visits.complaintPlaceholder')} /></div>
                </div>
                <details className="rounded-md border bg-secondary/20 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-muted-foreground">{t('clinic.visits.vitalsToggle')}</summary>
                  <div className="mt-3"><VitalsFields /></div>
                </details>
                <div className="flex gap-2">
                  <Button type="submit" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('clinic.visits.receiveButton')}</Button>
                  <Button type="button" variant="outline" onClick={() => setAdding(false)}>{t('clinic.visits.cancel')}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
        {patients.length === 0 && <p className="mt-2 text-sm text-muted-foreground">{t('clinic.visits.noPatients')}</p>}
      </div>

      {exam && <ExamForm exam={exam} pending={pending} onSubmit={(e) => submitForm(e, updateVisit, t('clinic.visits.toastSaved'), () => setExam(null))} onCancel={() => setExam(null)} />}

      {/* Queue board */}
      <div className="grid gap-4 lg:grid-cols-3">
        <QueueColumn title={t('clinic.visits.queueWaiting')} icon={Clock} count={waiting.length} tone="info" empty={t('clinic.visits.queueEmptyWaiting')}>
          {waiting.map((v) => (
            <QueueCard key={v.id} v={v} doctorLabel={doctorName(doctors, v.doctor_id)} typeLabel={TYPE[v.visit_type] ?? v.visit_type} locale={locale} complaintPrefix={t('clinic.visits.complaintPrefix')} doctorPrefix={t('clinic.visits.doctorPrefix')}>
              <Button size="sm" disabled={pending} onClick={() => run(() => setVisitStatus(v.id, 'in_progress'), t('clinic.visits.toastStarted'))}><Play className="h-3.5 w-3.5" /> {t('clinic.visits.startExam')}</Button>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => setExam(v)}>{t('clinic.visits.examButton')}</Button>
              {v.fee - v.paid_amount > 0 && v.fee > 0 && <Button size="sm" variant="outline" disabled={pending} onClick={() => collect(v)}>{t('clinic.visits.collectButton')}</Button>}
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setVisitStatus(v.id, 'cancelled'), t('clinic.visits.toastCancelled'))}><X className="h-3.5 w-3.5" /></Button>
            </QueueCard>
          ))}
        </QueueColumn>

        <QueueColumn title={t('clinic.visits.queueInProgress')} icon={Stethoscope} count={inProgress.length} tone="warning" empty={t('clinic.visits.queueEmptyProgress')}>
          {inProgress.map((v) => (
            <QueueCard key={v.id} v={v} doctorLabel={doctorName(doctors, v.doctor_id)} typeLabel={TYPE[v.visit_type] ?? v.visit_type} locale={locale} complaintPrefix={t('clinic.visits.complaintPrefix')} doctorPrefix={t('clinic.visits.doctorPrefix')}>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => setExam(v)}><ClipboardList className="h-3.5 w-3.5" /> {t('clinic.visits.completeExamButton')}</Button>
              {v.fee - v.paid_amount > 0 && v.fee > 0 && <Button size="sm" variant="outline" disabled={pending} onClick={() => collect(v)}>{t('clinic.visits.collectButton')}</Button>}
            </QueueCard>
          ))}
        </QueueColumn>

        <QueueColumn title={t('clinic.visits.queueDone')} icon={CheckCircle2} count={done.length} tone="success" empty={t('clinic.visits.queueEmptyDone')}>
          {done.slice(0, 40).map((v) => {
            const remaining = v.fee - v.paid_amount;
            return (
              <QueueCard key={v.id} v={v} muted doctorLabel={doctorName(doctors, v.doctor_id)} typeLabel={TYPE[v.visit_type] ?? v.visit_type} locale={locale} complaintPrefix={t('clinic.visits.complaintPrefix')} doctorPrefix={t('clinic.visits.doctorPrefix')}>
                {v.diagnosis && <p className="text-xs text-muted-foreground">{v.diagnosis}</p>}
                {remaining > 0 && v.fee > 0 && <Button size="sm" variant="outline" disabled={pending} onClick={() => collect(v)}>{t('clinic.visits.collectWithAmount', { amount: formatCurrency(remaining, 'EGP', INTL_LOCALE[locale]) })}</Button>}
                <Link href={`/print/clinic/visit/${v.id}`} target="_blank" className={buttonVariants({ size: 'sm', variant: 'ghost' })}><Printer className="h-3.5 w-3.5" /> {t('clinic.visits.printButton')}</Link>
              </QueueCard>
            );
          })}
        </QueueColumn>
      </div>
    </div>
  );
}

/** The clinical exam note — vitals + complaint + diagnosis + Rx + follow-up. */
export function ExamForm({
  exam, pending, onSubmit, onCancel,
}: {
  exam: Visit; pending: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void; onCancel: () => void;
}) {
  const { t } = useI18n();
  const confirm = useConfirm();

  // Guard: warn the doctor before finishing a visit that has no clinical data
  // entered (no diagnosis AND no prescription AND no tests). We re-submit the
  // same form element after confirmation (requestSubmit bypasses this handler's
  // guard via a one-shot flag) so the existing onSubmit contract is unchanged.
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const form = e.currentTarget;
    if (form.dataset.confirmed === '1') {
      form.dataset.confirmed = '';
      onSubmit(e);
      return;
    }
    e.preventDefault();
    const fd = new FormData(form);
    const isEmpty = (k: string) => !String(fd.get(k) ?? '').trim();
    if (isEmpty('diagnosis') && isEmpty('prescription') && isEmpty('tests')) {
      const go = await confirm({
        title: t('clinic.visits.emptyWarnTitle'),
        message: t('clinic.visits.emptyWarnBody'),
        confirmText: t('clinic.visits.emptyWarnConfirm'),
        cancelText: t('clinic.visits.cancel'),
      });
      if (!go) return;
    }
    form.dataset.confirmed = '1';
    form.requestSubmit();
  }

  return (
    <Card className="border-primary/40">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="hidden" name="id" value={exam.id} />
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold"><ClipboardList className="h-4 w-4" /> {t('clinic.visits.examFormTitle', { name: exam.patient?.name ?? '' })}</h3>
            <Link href={`/clinic/patients/${exam.patient_id}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              <FileText className="h-3.5 w-3.5" /> {t('clinic.visits.fullRecordLink')}
            </Link>
          </div>
          {/* Section: vital signs */}
          <ExamSection icon={Activity} title={t('clinic.visits.sectionVitals')}>
            <VitalsFields v={exam} />
          </ExamSection>

          {/* Section: assessment */}
          <ExamSection icon={Stethoscope} title={t('clinic.visits.sectionAssessment')}>
            <div className="space-y-1"><Label>{t('clinic.visits.fieldComplaint')}</Label><Input name="complaint" defaultValue={exam.complaint ?? ''} /></div>
            <div className="space-y-1"><Label>{t('clinic.visits.fieldDiagnosis')}</Label><textarea name="diagnosis" rows={2} defaultValue={exam.diagnosis ?? ''} className={taCls} /></div>
          </ExamSection>

          {/* Section: prescription */}
          <ExamSection icon={Pill} title={t('clinic.visits.fieldPrescription')}>
            <ClinicalListField
              name="prescription"
              kinds={['drug']}
              defaultValue={exam.prescription ?? ''}
              searchPlaceholder={t('clinic.visits.prescriptionSearchPlaceholder')}
              manualLabel={t('clinic.visits.prescriptionManualLabel')}
              itemPlaceholder={t('clinic.visits.prescriptionItemPlaceholder')}
              withDosage
            />
          </ExamSection>

          {/* Section: tests */}
          <ExamSection icon={FlaskConical} title={t('clinic.visits.fieldTests')}>
            <ClinicalListField
              name="tests"
              kinds={['lab', 'radiology']}
              defaultValue={exam.tests ?? ''}
              searchPlaceholder={t('clinic.visits.testsSearchPlaceholder')}
              manualLabel={t('clinic.visits.testsManualLabel')}
            />
          </ExamSection>

          {/* Section: follow-up */}
          <ExamSection icon={CalendarClock} title={t('clinic.visits.followupSection')}>
            <div className="space-y-1 sm:max-w-xs"><Label>{t('clinic.visits.followupSection')}</Label><Input name="followup_date" type="date" dir="ltr" defaultValue={exam.followup_date ?? ''} /></div>
            <label className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" name="book_followup" value="1" defaultChecked className="h-4 w-4" />
              {t('clinic.visits.followupAutoBook')}
            </label>
          </ExamSection>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}><CheckCircle2 className="h-4 w-4" /> {t('clinic.visits.saveAndFinish')}</Button>
            <Button type="button" variant="outline" onClick={onCancel}>{t('clinic.visits.cancel')}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** A titled, bordered section inside the exam form — keeps the doctor's screen
 *  scannable (vitals / assessment / prescription / tests / follow-up). */
function ExamSection({ icon: Icon, title, children }: { icon: typeof Clock; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-secondary/10 p-3">
      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </h4>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export function QueueColumn({
  title, icon: Icon, count, tone, empty, children,
}: {
  title: string; icon: typeof Clock; count: number;
  tone: 'info' | 'warning' | 'success'; empty: string; children: React.ReactNode;
}) {
  const toneCls = { info: 'text-info', warning: 'text-warning', success: 'text-success' }[tone];
  const isEmpty = Array.isArray(children) ? children.length === 0 : !children;
  return (
    <div className="rounded-lg border bg-secondary/20">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h3 className={`flex items-center gap-2 text-sm font-semibold ${toneCls}`}><Icon className="h-4 w-4" /> {title}</h3>
        <Badge variant="secondary">{count}</Badge>
      </div>
      <div className="space-y-2 p-2">
        {isEmpty ? <p className="p-4 text-center text-xs text-muted-foreground">{empty}</p> : children}
      </div>
    </div>
  );
}

export function QueueCard({ v, muted, doctorLabel, typeLabel, locale, complaintPrefix, doctorPrefix, children }: {
  v: Visit; muted?: boolean; doctorLabel?: string; typeLabel?: string;
  locale: string; complaintPrefix: string; doctorPrefix: string; children: React.ReactNode
}) {
  return (
    <Card className={muted ? 'opacity-90' : ''}>
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={`/clinic/patients/${v.patient_id}`} className="truncate font-medium text-primary hover:underline">{v.patient?.name ?? '—'}</Link>
            <p className="text-xs text-muted-foreground" dir="ltr">{formatDate(v.visit_date, INTL_LOCALE[locale as 'ar' | 'en'])} · {typeLabel ?? v.visit_type}</p>
            {doctorLabel && <p className="text-xs text-muted-foreground">{doctorPrefix} {doctorLabel}</p>}
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground" dir="ltr">{formatCurrency(v.fee, 'EGP', INTL_LOCALE[locale as 'ar' | 'en'])}</span>
        </div>
        <VitalsLine v={v} />
        {v.complaint && <p className="text-xs"><span className="text-muted-foreground">{complaintPrefix}</span>{v.complaint}</p>}
        <div className="flex flex-wrap items-center gap-1 pt-1">{children}</div>
      </CardContent>
    </Card>
  );
}
