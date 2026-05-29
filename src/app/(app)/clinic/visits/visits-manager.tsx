'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2, X, Stethoscope, CheckCircle2, Printer } from 'lucide-react';
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
  patient: { name: string; phone: string | null } | null;
}

const STATUS: Record<string, { label: string; variant: 'secondary' | 'info' | 'success' | 'destructive' | 'warning' }> = {
  waiting: { label: 'في الانتظار', variant: 'info' },
  in_progress: { label: 'جاري الكشف', variant: 'warning' },
  done: { label: 'تم', variant: 'success' },
  cancelled: { label: 'ملغي', variant: 'destructive' },
};
const TYPE: Record<string, string> = { consultation: 'كشف', followup: 'متابعة', procedure: 'إجراء' };
const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function VisitsManager({ visits, patients }: { visits: Visit[]; patients: PatientOption[] }) {
  const router = useRouter();
  const prompt = usePrompt();
  const [adding, setAdding] = useState(false);
  const [exam, setExam] = useState<Visit | null>(null);
  const [pending, startTransition] = useTransition();

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
    const form = e.currentTarget;
    const fd = new FormData(form);
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
                    <select name="patient_id" className={selectCls} required defaultValue="">
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
                  <div className="space-y-1 sm:col-span-2 lg:col-span-1"><Label>الشكوى</Label><Input name="complaint" placeholder="مثال: صداع وحرارة" /></div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} تسجيل</Button>
                  <Button type="button" variant="outline" onClick={() => setAdding(false)}>إلغاء</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
        {patients.length === 0 && <p className="mt-2 text-sm text-muted-foreground">سجّل مريضاً أولاً من صفحة المرضى.</p>}
      </div>

      {exam && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={(e) => submitForm(e, updateVisit, 'تم حفظ الكشف', () => setExam(null))} className="space-y-4">
              <input type="hidden" name="id" value={exam.id} />
              <h3 className="font-semibold">كشف: {exam.patient?.name}</h3>
              <div className="space-y-1"><Label>الشكوى</Label><Input name="complaint" defaultValue={exam.complaint ?? ''} /></div>
              <div className="space-y-1"><Label>التشخيص</Label><textarea name="diagnosis" rows={2} defaultValue={exam.diagnosis ?? ''} className="w-full rounded-md border border-input bg-background p-2 text-sm" /></div>
              <div className="space-y-1"><Label>الروشتة</Label><textarea name="prescription" rows={3} defaultValue={exam.prescription ?? ''} className="w-full rounded-md border border-input bg-background p-2 text-sm" /></div>
              <div className="flex gap-2">
                <Button type="submit" disabled={pending}><CheckCircle2 className="h-4 w-4" /> حفظ وإنهاء الكشف</Button>
                <Button type="button" variant="outline" onClick={() => setExam(null)}>إلغاء</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {visits.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
              <Stethoscope className="h-8 w-8" /><p>لا توجد كشوفات بعد.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-right font-medium">المريض</th>
                    <th className="p-3 text-right font-medium">التاريخ</th>
                    <th className="p-3 text-right font-medium">النوع</th>
                    <th className="p-3 text-right font-medium">التشخيص</th>
                    <th className="p-3 text-center font-medium">الرسوم</th>
                    <th className="p-3 text-center font-medium">الحالة</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {visits.map((v) => {
                    const st = STATUS[v.status] ?? { label: v.status, variant: 'secondary' as const };
                    const remaining = v.fee - v.paid_amount;
                    return (
                      <tr key={v.id} className="border-b align-top">
                        <td className="p-3 font-medium">{v.patient?.name ?? '—'}</td>
                        <td className="p-3 text-muted-foreground" dir="ltr">{formatDate(v.visit_date)}</td>
                        <td className="p-3">{TYPE[v.visit_type] ?? v.visit_type}</td>
                        <td className="p-3 text-muted-foreground">{v.diagnosis || (v.complaint ? <span className="text-xs">شكوى: {v.complaint}</span> : '—')}</td>
                        <td className="p-3 text-center tabular-nums" dir="ltr">
                          {formatCurrency(v.fee)}
                          {remaining > 0 && v.fee > 0 && <span className="block text-xs text-destructive">باقي {formatCurrency(remaining)}</span>}
                        </td>
                        <td className="p-3 text-center"><Badge variant={st.variant}>{st.label}</Badge></td>
                        <td className="p-3">
                          <div className="flex flex-wrap items-center justify-center gap-1">
                            {v.status !== 'done' && v.status !== 'cancelled' && (
                              <Button size="sm" variant="secondary" disabled={pending} onClick={() => setExam(v)}>كشف</Button>
                            )}
                            {remaining > 0 && v.fee > 0 && (
                              <Button size="sm" variant="outline" disabled={pending} onClick={() => collect(v)}>تحصيل</Button>
                            )}
                            {v.status === 'done' && (
                              <Link href={`/print/clinic/visit/${v.id}`} target="_blank" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
                                <Printer className="h-3.5 w-3.5" /> طباعة
                              </Link>
                            )}
                            {v.status === 'waiting' && (
                              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setVisitStatus(v.id, 'cancelled'), 'تم الإلغاء')}><X className="h-3.5 w-3.5" /></Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
