'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2, Wallet } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { usePrompt } from '@/components/prompt-dialog';
import { createVisit, recordVisitPayment } from '../actions';
import { type ClinicVisit as Visit, type PatientOption, type DoctorOption, VISIT_STATUS, selectCls } from '../clinical-ui';

export function ReceptionBilling({ visits, patients, doctors }: { visits: Visit[]; patients: PatientOption[]; doctors: DoctorOption[] }) {
  const router = useRouter();
  const prompt = usePrompt();
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();

  const outstanding = visits.filter((v) => v.status !== 'cancelled' && v.fee - v.paid_amount > 0);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) { toast.error(res.error ?? 'حدث خطأ'); return; }
      toast.success(ok);
      router.refresh();
    });
  }

  function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createVisit(fd);
      if (!res.ok) { toast.error(res.error ?? 'حدث خطأ'); return; }
      toast.success('تم استقبال المريض في الطابور');
      setAdding(false);
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
      {/* Walk-in: receive a patient (without a prior appointment) into the queue */}
      <div>
        {!adding ? (
          <Button onClick={() => setAdding(true)} disabled={patients.length === 0}><Plus className="h-4 w-4" /> استقبال مريض (بدون موعد)</Button>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={onCreate} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <Label>المريض *</Label>
                    <select name="patient_id" className={selectCls} required defaultValue="">
                      <option value="" disabled>اختر المريض</option>
                      {patients.map((p) => <option key={p.id} value={p.id}>{p.name}{p.phone ? ` — ${p.phone}` : ''}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>الطبيب</Label>
                    <select name="doctor_id" className={selectCls} defaultValue={doctors.length === 1 ? doctors[0].id : ''}>
                      <option value="">— غير محدد —</option>
                      {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name || d.email}</option>)}
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

      {/* Outstanding fees to collect */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b p-4">
            <h2 className="flex items-center gap-2 font-semibold"><Wallet className="h-4 w-4" /> رسوم تحت التحصيل</h2>
            <Badge variant="secondary">{outstanding.length}</Badge>
          </div>
          {outstanding.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">لا توجد رسوم متبقية للتحصيل.</p>
          ) : (
            <ul className="divide-y">
              {outstanding.map((v) => {
                const st = VISIT_STATUS[v.status] ?? { label: v.status, variant: 'secondary' as const };
                const remaining = v.fee - v.paid_amount;
                return (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{v.patient?.name ?? '—'}</p>
                      <p className="text-xs text-muted-foreground" dir="ltr">{formatDate(v.visit_date)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={st.variant}>{st.label}</Badge>
                      <span className="tabular-nums" dir="ltr">{formatCurrency(v.fee)} <span className="text-destructive">(باقي {formatCurrency(remaining)})</span></span>
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => collect(v)}>تحصيل</Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
