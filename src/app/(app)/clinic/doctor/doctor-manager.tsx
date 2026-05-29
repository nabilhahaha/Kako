'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { Play, ClipboardList, CheckCircle2, Printer, Clock, Stethoscope } from 'lucide-react';
import { updateVisit, setVisitStatus } from '../actions';
import {
  type ClinicVisit as Visit,
} from '../clinical-ui';
import { ExamForm, QueueColumn, QueueCard } from '../visits/visits-manager';

export function DoctorManager({ visits }: { visits: Visit[] }) {
  const router = useRouter();
  const [exam, setExam] = useState<Visit | null>(null);
  const [pending, startTransition] = useTransition();

  const waiting = visits.filter((v) => v.status === 'waiting');
  const inProgress = visits.filter((v) => v.status === 'in_progress');
  const done = visits.filter((v) => v.status === 'done');

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) { toast.error(res.error ?? 'حدث خطأ'); return; }
      toast.success(ok);
      router.refresh();
    });
  }

  function submitExam(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateVisit(fd);
      if (!res.ok) { toast.error(res.error ?? 'حدث خطأ'); return; }
      toast.success('تم حفظ الكشف');
      setExam(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {exam && <ExamForm exam={exam} pending={pending} onSubmit={submitExam} onCancel={() => setExam(null)} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <QueueColumn title="في الانتظار" icon={Clock} count={waiting.length} tone="info" empty="لا أحد في الانتظار.">
          {waiting.map((v) => (
            <QueueCard key={v.id} v={v}>
              <Button size="sm" disabled={pending} onClick={() => run(() => setVisitStatus(v.id, 'in_progress'), 'دخل الكشف')}><Play className="h-3.5 w-3.5" /> بدء الكشف</Button>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => setExam(v)}><ClipboardList className="h-3.5 w-3.5" /> فحص</Button>
            </QueueCard>
          ))}
        </QueueColumn>

        <QueueColumn title="جاري الكشف" icon={Stethoscope} count={inProgress.length} tone="warning" empty="لا يوجد كشف جارٍ.">
          {inProgress.map((v) => (
            <QueueCard key={v.id} v={v}>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => setExam(v)}><ClipboardList className="h-3.5 w-3.5" /> إكمال الكشف</Button>
            </QueueCard>
          ))}
        </QueueColumn>

        <QueueColumn title="تم اليوم" icon={CheckCircle2} count={done.length} tone="success" empty="لا كشوفات منتهية بعد.">
          {done.slice(0, 40).map((v) => (
            <QueueCard key={v.id} v={v} muted>
              {v.diagnosis && <p className="text-xs text-muted-foreground">{v.diagnosis}</p>}
              <Link href={`/clinic/patients/${v.patient_id}`} className={buttonVariants({ size: 'sm', variant: 'ghost' })}>الملف</Link>
              <Link href={`/print/clinic/visit/${v.id}`} target="_blank" className={buttonVariants({ size: 'sm', variant: 'ghost' })}><Printer className="h-3.5 w-3.5" /> طباعة</Link>
            </QueueCard>
          ))}
        </QueueColumn>
      </div>
    </div>
  );
}
