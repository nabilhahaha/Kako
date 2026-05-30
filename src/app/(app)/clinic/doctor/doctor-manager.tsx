'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { Play, ClipboardList, Printer } from 'lucide-react';
import { updateVisit, setVisitStatus } from '../actions';
import { type ClinicVisit as Visit, type DoctorOption, doctorName, selectCls } from '../clinical-ui';
import { ExamForm, QueueColumn, QueueCard } from '../visits/visits-manager';
import { useI18n } from '@/lib/i18n/provider';
import { Clock, Stethoscope, CheckCircle2 } from 'lucide-react';

export function DoctorManager({
  visits,
  doctors,
  currentDoctorId,
}: {
  visits: Visit[];
  doctors: DoctorOption[];
  currentDoctorId: string;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [exam, setExam] = useState<Visit | null>(null);
  const [pending, startTransition] = useTransition();
  // Default to the signed-in doctor's own queue; can switch to all / a colleague.
  const meIsDoctor = doctors.some((d) => d.id === currentDoctorId);
  const [filter, setFilter] = useState<string>(meIsDoctor ? currentDoctorId : 'all');

  const TYPE: Record<string, string> = {
    consultation: t('clinic.visitType.consultation'),
    followup: t('clinic.visitType.followup'),
    procedure: t('clinic.visitType.procedure'),
  };

  const scoped = filter === 'all' ? visits : visits.filter((v) => v.doctor_id === filter);
  const waiting = scoped.filter((v) => v.status === 'waiting');
  const inProgress = scoped.filter((v) => v.status === 'in_progress');
  const done = scoped.filter((v) => v.status === 'done');

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) { toast.error(res.error ?? t('clinic.doctor.toastError')); return; }
      toast.success(ok);
      router.refresh();
    });
  }

  function submitExam(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateVisit(fd);
      if (!res.ok) { toast.error(res.error ?? t('clinic.doctor.toastError')); return; }
      toast.success(t('clinic.doctor.toastSaved'));
      setExam(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Doctor filter — only meaningful when the clinic has more than one */}
      {doctors.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('clinic.doctor.queueFilterLabel')}</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className={`${selectCls} w-auto`}>
            {meIsDoctor && <option value={currentDoctorId}>{t('clinic.doctor.myQueue')}</option>}
            <option value="all">{t('clinic.doctor.allDoctors')}</option>
            {doctors.filter((d) => d.id !== currentDoctorId).map((d) => (
              <option key={d.id} value={d.id}>{t('clinic.doctor.doctorPrefix')} {d.full_name || d.email}</option>
            ))}
          </select>
        </div>
      )}

      {exam && <ExamForm exam={exam} pending={pending} onSubmit={submitExam} onCancel={() => setExam(null)} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <QueueColumn title={t('clinic.visits.queueWaiting')} icon={Clock} count={waiting.length} tone="info" empty={t('clinic.visits.queueEmptyWaiting')}>
          {waiting.map((v) => (
            <QueueCard key={v.id} v={v} doctorLabel={doctorName(doctors, v.doctor_id)} typeLabel={TYPE[v.visit_type] ?? v.visit_type} locale={locale} complaintPrefix={t('clinic.visits.complaintPrefix')} doctorPrefix={t('clinic.doctor.doctorPrefix')}>
              <Button size="sm" disabled={pending} onClick={() => run(() => setVisitStatus(v.id, 'in_progress'), t('clinic.doctor.toastStarted'))}><Play className="h-3.5 w-3.5" /> {t('clinic.visits.startExam')}</Button>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => setExam(v)}><ClipboardList className="h-3.5 w-3.5" /> {t('clinic.doctor.examButton')}</Button>
            </QueueCard>
          ))}
        </QueueColumn>

        <QueueColumn title={t('clinic.visits.queueInProgress')} icon={Stethoscope} count={inProgress.length} tone="warning" empty={t('clinic.visits.queueEmptyProgress')}>
          {inProgress.map((v) => (
            <QueueCard key={v.id} v={v} doctorLabel={doctorName(doctors, v.doctor_id)} typeLabel={TYPE[v.visit_type] ?? v.visit_type} locale={locale} complaintPrefix={t('clinic.visits.complaintPrefix')} doctorPrefix={t('clinic.doctor.doctorPrefix')}>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => setExam(v)}><ClipboardList className="h-3.5 w-3.5" /> {t('clinic.doctor.completeExam')}</Button>
            </QueueCard>
          ))}
        </QueueColumn>

        <QueueColumn title={t('clinic.visits.queueDone')} icon={CheckCircle2} count={done.length} tone="success" empty={t('clinic.visits.queueEmptyDone')}>
          {done.slice(0, 40).map((v) => (
            <QueueCard key={v.id} v={v} muted doctorLabel={doctorName(doctors, v.doctor_id)} typeLabel={TYPE[v.visit_type] ?? v.visit_type} locale={locale} complaintPrefix={t('clinic.visits.complaintPrefix')} doctorPrefix={t('clinic.doctor.doctorPrefix')}>
              {v.diagnosis && <p className="text-xs text-muted-foreground">{v.diagnosis}</p>}
              <Link href={`/clinic/patients/${v.patient_id}`} className={buttonVariants({ size: 'sm', variant: 'ghost' })}>{t('clinic.doctor.fileButton')}</Link>
              <Link href={`/print/clinic/visit/${v.id}`} target="_blank" className={buttonVariants({ size: 'sm', variant: 'ghost' })}><Printer className="h-3.5 w-3.5" /> {t('clinic.doctor.printButton')}</Link>
            </QueueCard>
          ))}
        </QueueColumn>
      </div>
    </div>
  );
}
