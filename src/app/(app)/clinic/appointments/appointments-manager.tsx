'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2, X, CalendarClock, CheckCircle2, LogIn } from 'lucide-react';
import { WhatsAppButton } from '@/components/whatsapp-button';
import { usePrompt } from '@/components/prompt-dialog';
import { createAppointment, setAppointmentStatus, checkInAppointment } from '../actions';
import { type DoctorOption, doctorName } from '../clinical-ui';
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';

export interface PatientOption { id: string; name: string; phone: string | null }

export interface Appointment {
  id: string;
  scheduled_at: string;
  duration_min: number;
  reason: string | null;
  status: string;
  doctor_id: string | null;
  patient: { name: string; phone: string | null } | null;
}

const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Default the booking field to the next round hour, as a datetime-local value. */
function defaultSlot() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  // datetime-local expects local time without timezone, trimmed to minutes.
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function AppointmentsManager({
  appointments,
  patients,
  doctors,
  initialPatientId,
}: {
  appointments: Appointment[];
  patients: PatientOption[];
  doctors: DoctorOption[];
  initialPatientId?: string | null;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const prompt = usePrompt();
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();

  const slot = useMemo(defaultSlot, []);

  const STATUS: Record<string, { label: string; variant: 'secondary' | 'info' | 'success' | 'destructive' | 'warning' | 'default' }> = {
    scheduled: { label: t('clinic.apptStatus.scheduled'), variant: 'info' },
    confirmed: { label: t('clinic.apptStatus.confirmed'), variant: 'default' },
    arrived: { label: t('clinic.apptStatus.arrivedVisit'), variant: 'success' },
    done: { label: t('clinic.apptStatus.done'), variant: 'success' },
    cancelled: { label: t('clinic.apptStatus.cancelled'), variant: 'destructive' },
    no_show: { label: t('clinic.apptStatus.no_show'), variant: 'secondary' },
  };

  const dateTimeFmt = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  // Deep-link from a patient file (?patient=…) opens the booking form ready.
  useEffect(() => {
    if (initialPatientId && patients.some((p) => p.id === initialPatientId)) setAdding(true);
  }, [initialPatientId, patients]);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) { toast.error(res.error ?? t('clinic.appointments.toastError')); return; }
      toast.success(ok);
      router.refresh();
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createAppointment(fd);
      if (!res.ok) { toast.error(res.error ?? t('clinic.appointments.toastError')); return; }
      toast.success(t('clinic.appointments.toastBooked'));
      setAdding(false);
      router.refresh();
    });
  }

  function checkIn(a: Appointment) {
    prompt({
      title: t('clinic.appointments.checkInTitle'),
      message: t('clinic.appointments.checkInMessage', { name: a.patient?.name ?? '' }),
      label: t('clinic.appointments.checkInFeeLabel'), type: 'number', defaultValue: '',
      confirmText: t('clinic.appointments.checkInConfirm'),
    }).then((raw) => {
      if (raw == null) return;
      const fd = new FormData();
      fd.set('appointment_id', a.id);
      const fee = Number(raw);
      fd.set('fee', Number.isFinite(fee) && fee > 0 ? String(fee) : '0');
      run(() => checkInAppointment(fd), t('clinic.appointments.toastCheckedIn'));
    });
  }

  return (
    <div className="space-y-4">
      <div>
        {!adding ? (
          <Button onClick={() => setAdding(true)} disabled={patients.length === 0}>
            <Plus className="h-4 w-4" /> {t('clinic.appointments.newButton')}
          </Button>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <Label>{t('clinic.appointments.fieldPatient')}</Label>
                    <select name="patient_id" className={selectCls} required defaultValue={initialPatientId ?? ''}>
                      <option value="" disabled>{t('clinic.appointments.patientPlaceholder')}</option>
                      {patients.map((p) => <option key={p.id} value={p.id}>{p.name}{p.phone ? ` — ${p.phone}` : ''}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>{t('clinic.appointments.fieldDoctor')}</Label>
                    <select name="doctor_id" className={selectCls} defaultValue={doctors.length === 1 ? doctors[0].id : ''}>
                      <option value="">{t('clinic.appointments.doctorPlaceholder')}</option>
                      {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name || d.email}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>{t('clinic.appointments.fieldDateTime')}</Label>
                    <Input name="scheduled_at" type="datetime-local" required defaultValue={slot} dir="ltr" />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('clinic.appointments.fieldDuration')}</Label>
                    <Input name="duration_min" type="number" min={5} step={5} dir="ltr" defaultValue={30} />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('clinic.appointments.fieldReason')}</Label>
                    <Input name="reason" placeholder={t('clinic.appointments.reasonPlaceholder')} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('clinic.appointments.bookButton')}</Button>
                  <Button type="button" variant="outline" onClick={() => setAdding(false)}>{t('clinic.appointments.cancel')}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
        {patients.length === 0 && <p className="mt-2 text-sm text-muted-foreground">{t('clinic.appointments.noPatients')}</p>}
      </div>

      <Card>
        <CardContent className="p-0">
          {appointments.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
              <CalendarClock className="h-8 w-8" /><p>{t('clinic.appointments.emptyList')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('clinic.appointments.colPatient')}</th>
                    <th className="p-3 text-start font-medium">{t('clinic.appointments.colAppointment')}</th>
                    <th className="p-3 text-start font-medium">{t('clinic.appointments.colDoctor')}</th>
                    <th className="p-3 text-start font-medium">{t('clinic.appointments.colReason')}</th>
                    <th className="p-3 text-center font-medium">{t('clinic.appointments.colStatus')}</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.map((a) => {
                    const st = STATUS[a.status] ?? { label: a.status, variant: 'secondary' as const };
                    const open = a.status === 'scheduled' || a.status === 'confirmed';
                    return (
                      <tr key={a.id} className="border-b align-top">
                        <td className="p-3 font-medium">
                          {a.patient?.name ?? '—'}
                          {a.patient?.phone && <span className="block text-xs text-muted-foreground" dir="ltr">{a.patient.phone}</span>}
                        </td>
                        <td className="p-3 text-muted-foreground" dir="ltr">{dateTimeFmt.format(new Date(a.scheduled_at))}</td>
                        <td className="p-3 text-muted-foreground">{doctorName(doctors, a.doctor_id)}</td>
                        <td className="p-3 text-muted-foreground">{a.reason || '—'}</td>
                        <td className="p-3 text-center"><Badge variant={st.variant}>{st.label}</Badge></td>
                        <td className="p-3">
                          <div className="flex flex-wrap items-center justify-center gap-1">
                            {open && (
                              <>
                                <WhatsAppButton
                                  phone={a.patient?.phone}
                                  label={t('clinic.appointments.reminderLabel')}
                                  message={t('clinic.appointments.reminderMessage', { name: a.patient?.name ?? '', time: dateTimeFmt.format(new Date(a.scheduled_at)) })}
                                />
                                <Button size="sm" variant="secondary" disabled={pending} onClick={() => checkIn(a)}>
                                  <LogIn className="h-3.5 w-3.5" /> {t('clinic.appointments.arrivedButton')}
                                </Button>
                                {a.status === 'scheduled' && (
                                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setAppointmentStatus(a.id, 'confirmed'), t('clinic.appointments.toastConfirmed'))}>
                                    <CheckCircle2 className="h-3.5 w-3.5" /> {t('clinic.appointments.confirmButton')}
                                  </Button>
                                )}
                                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setAppointmentStatus(a.id, 'no_show'), t('clinic.appointments.toastNoShow'))}>
                                  {t('clinic.appointments.noShowButton')}
                                </Button>
                                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setAppointmentStatus(a.id, 'cancelled'), t('clinic.appointments.toastCancelled'))}>
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </>
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
