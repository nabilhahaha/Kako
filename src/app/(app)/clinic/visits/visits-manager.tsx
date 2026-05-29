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
import { Plus, Loader2, X, Stethoscope, CheckCircle2, Printer, Play, Clock, ClipboardList } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { usePrompt } from '@/components/prompt-dialog';
import { createVisit, updateVisit, setVisitStatus, recordVisitPayment } from '../actions';

export interface PatientOption { id: string; name: string; phone: string | null }

export interface Visit {
  id: string;
  visit_date: string;
  visit_type: string;
  complaint: string | null;
  diagnosis: string | null;
  prescription: string | null;
  fee: number;
  paid_amount: number;
  status: string;
  temperature: number | null;
  blood_pressure: string | null;
  pulse: number | null;
  weight: number | null;
  height: number | null;
  followup_date: string | null;
  patient: { name: string; phone: string | null } | null;
}

const TYPE: Record<string, string> = { consultation: 'كشف', followup: 'متابعة', procedure: 'إجراء' };
const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const taCls = 'w-full rounded-md border border-input bg-background p-2 text-sm';

/** Vital-sign inputs, shared by the new-visit and exam forms. */
function VitalsFields({ v }: { v?: Visit }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <div className="space-y-1"><Label>الحرارة °م</Label><Input name="temperature" type="number" step="0.1" dir="ltr" defaultValue={v?.temperature ?? ''} /></div>
      <div className="space-y-1"><Label>الضغط</Label><Input name="blood_pressure" placeholder="120/80" dir="ltr" defaultValue={v?.blood_pressure ?? ''} /></div>
      <div className="space-y-1"><Label>النبض</Label><Input name="pulse" type="number" dir="ltr" defaultValue={v?.pulse ?? ''} /></div>
      <div className="space-y-1"><Label>الوزن كجم</Label><Input name="weight" type="number" step="0.1" dir="ltr" defaultValue={v?.weight ?? ''} /></div>
      <div className="space-y-1"><Label>الطول سم</Label><Input name="height" type="number" step="0.1" dir="ltr" defaultValue={v?.height ?? ''} /></div>
    </div>
  );
}

function VitalsLine({ v }: { v: Visit }) {
  const has = v.temperature != null || v.blood_pressure || v.pulse != null || v.weight != null;
  if (!has) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground" dir="ltr">
      {v.temperature != null && <span>🌡 {v.temperature}°</span>}
      {v.blood_pressure && <span>🩸 {v.blood_pressure}</span>}
      {v.pulse != null && <span>💓 {v.pulse}</span>}
      {v.weight != null && <span>⚖ {v.weight}kg</span>}
    </div>
  );
}

export function VisitsManager({
  visits,
  patients,
  initialPatientId,
}: {
  visits: Visit[];
  patients: PatientOption[];
  initialPatientId?: string | null;
}) {
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

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) { toast.error(res.error ?? 'حدث خطأ'); return; }
      toast.success(ok);
      router.refresh();
    });
  }

  function submitForm(e: React.FormEvent<HTMLFormElement>, fn: (fd: FormData) => Promise<{ ok: boolean; error?: string }>, ok: string, after: () => void) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await fn(fd);
      if (!res.ok) { toast.error(res.error ?? 'حدث خطأ'); return; }
      toast.success(ok);
      after();
      router.refresh();
    });
  }

  function collect(v: Visit) {
    const remaining = v.fee - v.paid_amount;
    prompt({
      title: 'تحصيل رسوم الكشف',
      message: `${v.patient?.name ?? ''} — المتبقي ${remaining.toLocaleString('ar-EG')} ج.م`,
      label: 'المبلغ', type: 'number', defaultValue: remaining > 0 ? String(remaining) : '',
      confirmText: 'تحصيل',
    }).then((raw) => {
      if (raw == null) return;
      const amt = Number(raw);
      if (!Number.isFinite(amt) || amt <= 0) { toast.error('مبلغ غير صحيح'); return; }
      run(() => recordVisitPayment(v.id, amt), 'تم تسجيل الدفعة');
    });
  }

  return (
    <div className="space-y-4">
      {/* New visit */}
      <div>
        {!adding ? (
          <Button onClick={() => setAdding(true)} disabled={patients.length === 0}><Plus className="h-4 w-4" /> كشف جديد</Button>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={(e) => submitForm(e, createVisit, 'تم تسجيل الكشف', () => setAdding(false))} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <Label>المريض *</Label>
                    <select name="patient_id" className={selectCls} required defaultValue={initialPatientId ?? ''}>
                      <option value="" disabled>اختر المريض</option>
                      {patients.map((p) => <option key={p.id} value={p.id}>{p.name}{p.phone ? ` — ${p.phone}` : ''}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>نوع الزيارة</Label>
                    <select name="visit_type" className={selectCls} defaultValue="consultation">
                      <option value="consultation">كشف</option><option value="followup">متابعة</option><option value="procedure">إجراء</option>
                    </select>
                  </div>
                  <div className="space-y-1"><Label>رسوم الكشف</Label><Input name="fee" type="number" min={0} step="0.01" dir="ltr" defaultValue={0} /></div>
                  <div className="space-y-1"><Label>الشكوى</Label><Input name="complaint" placeholder="مثال: صداع وحرارة" /></div>
                </div>
                <details className="rounded-md border bg-secondary/20 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-muted-foreground">العلامات الحيوية (اختياري)</summary>
                  <div className="mt-3"><VitalsFields /></div>
                </details>
                <div className="flex gap-2">
                  <Button type="submit" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} استقبال في الطابور</Button>
                  <Button type="button" variant="outline" onClick={() => setAdding(false)}>إلغاء</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
        {patients.length === 0 && <p className="mt-2 text-sm text-muted-foreground">سجّل مريضاً أولاً من صفحة المرضى.</p>}
      </div>

      {/* Exam (clinical note) */}
      {exam && (
        <Card className="border-primary/40">
          <CardContent className="pt-6">
            <form onSubmit={(e) => submitForm(e, updateVisit, 'تم حفظ الكشف', () => setExam(null))} className="space-y-4">
              <input type="hidden" name="id" value={exam.id} />
              <h3 className="flex items-center gap-2 font-semibold"><ClipboardList className="h-4 w-4" /> كشف: {exam.patient?.name}</h3>
              <VitalsFields v={exam} />
              <div className="space-y-1"><Label>الشكوى</Label><Input name="complaint" defaultValue={exam.complaint ?? ''} /></div>
              <div className="space-y-1"><Label>التشخيص</Label><textarea name="diagnosis" rows={2} defaultValue={exam.diagnosis ?? ''} className={taCls} /></div>
              <div className="space-y-1"><Label>الروشتة</Label><textarea name="prescription" rows={3} defaultValue={exam.prescription ?? ''} className={taCls} placeholder="اكتب كل دواء في سطر…" /></div>
              <div className="space-y-1 sm:max-w-xs"><Label>تاريخ المتابعة (اختياري)</Label><Input name="followup_date" type="date" dir="ltr" defaultValue={exam.followup_date ?? ''} /></div>
              <div className="flex gap-2">
                <Button type="submit" disabled={pending}><CheckCircle2 className="h-4 w-4" /> حفظ وإنهاء الكشف</Button>
                <Button type="button" variant="outline" onClick={() => setExam(null)}>إلغاء</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Queue board */}
      <div className="grid gap-4 lg:grid-cols-3">
        <QueueColumn title="في الانتظار" icon={Clock} count={waiting.length} tone="info" empty="لا أحد في الانتظار.">
          {waiting.map((v) => (
            <QueueCard key={v.id} v={v}>
              <Button size="sm" disabled={pending} onClick={() => run(() => setVisitStatus(v.id, 'in_progress'), 'دخل الكشف')}><Play className="h-3.5 w-3.5" /> بدء الكشف</Button>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => setExam(v)}>فحص</Button>
              {v.fee - v.paid_amount > 0 && v.fee > 0 && <Button size="sm" variant="outline" disabled={pending} onClick={() => collect(v)}>تحصيل</Button>}
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setVisitStatus(v.id, 'cancelled'), 'تم الإلغاء')}><X className="h-3.5 w-3.5" /></Button>
            </QueueCard>
          ))}
        </QueueColumn>

        <QueueColumn title="جاري الكشف" icon={Stethoscope} count={inProgress.length} tone="warning" empty="لا يوجد كشف جارٍ.">
          {inProgress.map((v) => (
            <QueueCard key={v.id} v={v}>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => setExam(v)}><ClipboardList className="h-3.5 w-3.5" /> إكمال الكشف</Button>
              {v.fee - v.paid_amount > 0 && v.fee > 0 && <Button size="sm" variant="outline" disabled={pending} onClick={() => collect(v)}>تحصيل</Button>}
            </QueueCard>
          ))}
        </QueueColumn>

        <QueueColumn title="تم اليوم" icon={CheckCircle2} count={done.length} tone="success" empty="لا كشوفات منتهية بعد.">
          {done.slice(0, 40).map((v) => {
            const remaining = v.fee - v.paid_amount;
            return (
              <QueueCard key={v.id} v={v} muted>
                {v.diagnosis && <p className="text-xs text-muted-foreground">{v.diagnosis}</p>}
                {remaining > 0 && v.fee > 0 && <Button size="sm" variant="outline" disabled={pending} onClick={() => collect(v)}>تحصيل ({formatCurrency(remaining)})</Button>}
                <Link href={`/print/clinic/visit/${v.id}`} target="_blank" className={buttonVariants({ size: 'sm', variant: 'ghost' })}><Printer className="h-3.5 w-3.5" /> طباعة</Link>
              </QueueCard>
            );
          })}
        </QueueColumn>
      </div>
    </div>
  );
}

function QueueColumn({
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

function QueueCard({ v, muted, children }: { v: Visit; muted?: boolean; children: React.ReactNode }) {
  return (
    <Card className={muted ? 'opacity-90' : ''}>
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium">{v.patient?.name ?? '—'}</p>
            <p className="text-xs text-muted-foreground" dir="ltr">{formatDate(v.visit_date)} · {TYPE[v.visit_type] ?? v.visit_type}</p>
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground" dir="ltr">{formatCurrency(v.fee)}</span>
        </div>
        <VitalsLine v={v} />
        {v.complaint && <p className="text-xs"><span className="text-muted-foreground">شكوى: </span>{v.complaint}</p>}
        <div className="flex flex-wrap items-center gap-1 pt-1">{children}</div>
      </CardContent>
    </Card>
  );
}
