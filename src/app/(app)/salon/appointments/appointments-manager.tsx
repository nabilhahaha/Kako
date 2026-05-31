'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2, X, CalendarClock, CheckCircle2, LogIn } from 'lucide-react';
import { WhatsAppButton } from '@/components/whatsapp-button';
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { createAppointment, setAppointmentStatus, checkInAppointment } from '../actions';

export interface StylistOption { id: string; full_name: string | null; email: string | null }
export interface ServiceOption { id: string; name: string; price: number }
export interface Appt { id: string; scheduled_at: string; status: string; stylist_id: string | null; service_id: string | null; customer_name: string | null; customer_phone: string | null }

const selectCls = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function defaultSlot() {
  const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function SalonAppointments({ appts, staff, services }: { appts: Appt[]; staff: StylistOption[]; services: ServiceOption[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const slot = useMemo(defaultSlot, []);
  const fmt = useMemo(() => new Intl.DateTimeFormat(INTL_LOCALE[locale], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), [locale]);
  const stylistName = (id: string | null) => { const s = staff.find((x) => x.id === id); return s ? (s.full_name || s.email) : '—'; };
  const serviceName = (id: string | null) => services.find((x) => x.id === id)?.name ?? '—';

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    startTransition(async () => { const res = await fn(); if (!res.ok) { toast.error(res.error ?? t('salon.appointments.toastError')); return; } toast.success(ok); router.refresh(); });
  }
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd = new FormData(e.currentTarget);
    startTransition(async () => { const res = await createAppointment(fd); if (!res.ok) { toast.error(res.error ?? t('salon.appointments.toastError')); return; } toast.success(t('salon.appointments.toastBooked')); setAdding(false); router.refresh(); });
  }
  function checkIn(a: Appt) {
    startTransition(async () => {
      const res = await checkInAppointment(a.id);
      if (!res.ok || !res.data) { toast.error(res.error ?? t('salon.appointments.toastError')); return; }
      toast.success(t('salon.appointments.toastCheckedIn')); router.push(`/salon/tickets/${res.data}`);
    });
  }

  return (
    <div className="space-y-4">
      <div>
        {!adding ? (
          <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('salon.appointments.newButton')}</Button>
        ) : (
          <Card><CardContent className="pt-6">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1"><Label>{t('salon.appointments.fieldCustomerName')}</Label><Input name="customer_name" placeholder={t('salon.appointments.customerNamePlaceholder')} /></div>
                <div className="space-y-1"><Label>{t('salon.appointments.fieldPhone')}</Label><Input name="customer_phone" dir="ltr" /></div>
                <div className="space-y-1"><Label>{t('salon.appointments.fieldStylist')}</Label>
                  <select name="stylist_id" className={selectCls} defaultValue={staff.length === 1 ? staff[0].id : ''}>
                    <option value="">{t('salon.appointments.unassigned')}</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
                  </select>
                </div>
                <div className="space-y-1"><Label>{t('salon.appointments.fieldService')}</Label>
                  <select name="service_id" className={selectCls} defaultValue=""><option value="">{t('salon.appointments.unassigned')}</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                </div>
                <div className="space-y-1"><Label>{t('salon.appointments.fieldDateTime')}</Label><Input name="scheduled_at" type="datetime-local" required defaultValue={slot} dir="ltr" /></div>
                <div className="space-y-1"><Label>{t('salon.appointments.fieldDuration')}</Label><Input name="duration_min" type="number" min={5} step={5} dir="ltr" defaultValue={30} /></div>
              </div>
              <div className="flex gap-2"><Button type="submit" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('salon.appointments.bookButton')}</Button><Button type="button" variant="outline" onClick={() => setAdding(false)}>{t('salon.appointments.cancelButton')}</Button></div>
            </form>
          </CardContent></Card>
        )}
      </div>

      <Card><CardContent className="p-0">
        {appts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground"><CalendarClock className="h-8 w-8" /><p>{t('salon.appointments.emptyList')}</p></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="border-b bg-secondary/50 text-muted-foreground"><tr>
              <th className="p-3 text-start font-medium">{t('salon.appointments.colCustomer')}</th><th className="p-3 text-start font-medium">{t('salon.appointments.colAppointment')}</th><th className="p-3 text-start font-medium">{t('salon.appointments.colStylist')}</th><th className="p-3 text-start font-medium">{t('salon.appointments.colService')}</th><th className="p-3 text-center font-medium">{t('salon.appointments.colStatus')}</th><th className="p-3"></th>
            </tr></thead>
            <tbody>
              {appts.map((a) => {
                const statusKey = `salon.apptStatus.${a.status}`;
                const statusLabel = t(statusKey) !== statusKey ? t(statusKey) : a.status;
                const statusVariants: Record<string, 'secondary' | 'info' | 'success' | 'destructive' | 'warning' | 'default'> = {
                  scheduled: 'info', confirmed: 'default', arrived: 'success', done: 'success',
                  cancelled: 'destructive', no_show: 'secondary',
                };
                const variant = statusVariants[a.status] ?? 'secondary';
                const open = a.status === 'scheduled' || a.status === 'confirmed';
                return (
                  <tr key={a.id} className="border-b align-top">
                    <td className="p-3 font-medium">{a.customer_name || '—'}{a.customer_phone && <span className="block text-xs text-muted-foreground" dir="ltr">{a.customer_phone}</span>}</td>
                    <td className="p-3 text-muted-foreground" dir="ltr">{fmt.format(new Date(a.scheduled_at))}</td>
                    <td className="p-3 text-muted-foreground">{stylistName(a.stylist_id)}</td>
                    <td className="p-3 text-muted-foreground">{serviceName(a.service_id)}</td>
                    <td className="p-3 text-center"><Badge variant={variant}>{statusLabel}</Badge></td>
                    <td className="p-3"><div className="flex flex-wrap items-center justify-center gap-1">
                      {open && (<>
                        <WhatsAppButton phone={a.customer_phone} label={t('salon.appointments.reminderLabel')} message={t('salon.appointments.reminderMessage', { name: a.customer_name ?? '', time: fmt.format(new Date(a.scheduled_at)) })} />
                        <Button size="sm" variant="secondary" disabled={pending} onClick={() => checkIn(a)}><LogIn className="h-3.5 w-3.5" /> {t('salon.appointments.arrivedButton')}</Button>
                        {a.status === 'scheduled' && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setAppointmentStatus(a.id, 'confirmed'), t('salon.appointments.toastConfirmed'))}><CheckCircle2 className="h-3.5 w-3.5" /> {t('salon.appointments.confirmButton')}</Button>}
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setAppointmentStatus(a.id, 'no_show'), t('salon.appointments.toastNoShow'))}>{t('salon.appointments.noShowButton')}</Button>
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setAppointmentStatus(a.id, 'cancelled'), t('salon.appointments.toastCancelled'))}><X className="h-3.5 w-3.5" /></Button>
                      </>)}
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </CardContent></Card>
    </div>
  );
}
