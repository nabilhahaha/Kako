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
import { type ClinicVisit as Visit, type PatientOption, type DoctorOption, type ServiceOption, ServicePicker, selectCls } from '../clinical-ui';
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';

export function ReceptionBilling({ visits, patients, doctors, services }: { visits: Visit[]; patients: PatientOption[]; doctors: DoctorOption[]; services: ServiceOption[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const prompt = usePrompt();
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();

  const VISIT_STATUS: Record<string, { label: string; variant: 'secondary' | 'info' | 'success' | 'destructive' | 'warning' }> = {
    waiting: { label: t('clinic.visitStatus.waiting'), variant: 'info' },
    in_progress: { label: t('clinic.visitStatus.in_progress'), variant: 'warning' },
    done: { label: t('clinic.visitStatus.done'), variant: 'success' },
    cancelled: { label: t('clinic.visitStatus.cancelled'), variant: 'destructive' },
  };

  const outstanding = visits.filter((v) => v.status !== 'cancelled' && v.fee - v.paid_amount > 0);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) { toast.error(res.error ?? t('clinic.reception.toastError')); return; }
      toast.success(ok);
      router.refresh();
    });
  }

  function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createVisit(fd);
      if (!res.ok) { toast.error(res.error ?? t('clinic.reception.toastError')); return; }
      toast.success(t('clinic.reception.toastReceived'));
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
      {/* Walk-in: receive a patient (without a prior appointment) into the queue */}
      <div>
        {!adding ? (
          <Button onClick={() => setAdding(true)} disabled={patients.length === 0}><Plus className="h-4 w-4" /> {t('clinic.reception.walkInButton')}</Button>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={onCreate} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <Label>{t('clinic.visits.fieldPatient')}</Label>
                    <select name="patient_id" className={selectCls} required defaultValue="">
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
                <div className="flex gap-2">
                  <Button type="submit" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('clinic.reception.receiveButton')}</Button>
                  <Button type="button" variant="outline" onClick={() => setAdding(false)}>{t('clinic.reception.cancel')}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
        {patients.length === 0 && <p className="mt-2 text-sm text-muted-foreground">{t('clinic.reception.noPatients')}</p>}
      </div>

      {/* Outstanding fees to collect */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b p-4">
            <h2 className="flex items-center gap-2 font-semibold"><Wallet className="h-4 w-4" /> {t('clinic.reception.outstandingTitle')}</h2>
            <Badge variant="secondary">{outstanding.length}</Badge>
          </div>
          {outstanding.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{t('clinic.reception.outstandingEmpty')}</p>
          ) : (
            <ul className="divide-y">
              {outstanding.map((v) => {
                const st = VISIT_STATUS[v.status] ?? { label: v.status, variant: 'secondary' as const };
                const remaining = v.fee - v.paid_amount;
                return (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{v.patient?.name ?? '—'}</p>
                      <p className="text-xs text-muted-foreground" dir="ltr">{formatDate(v.visit_date, INTL_LOCALE[locale])}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={st.variant}>{st.label}</Badge>
                      <span className="tabular-nums" dir="ltr">{formatCurrency(v.fee, 'EGP', INTL_LOCALE[locale])} <span className="text-destructive">({t('clinic.reception.remainingFee', { amount: formatCurrency(remaining, 'EGP', INTL_LOCALE[locale]) })})</span></span>
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => collect(v)}>{t('clinic.reception.collectButton')}</Button>
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
