'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2, LogIn, LogOut, X } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { createBooking, setBookingStatus, addBookingPayment } from '../actions';
import { usePrompt } from '@/components/prompt-dialog';
import { useI18n } from '@/lib/i18n/provider';

export interface RoomOption {
  id: string;
  code: string;
  name: string | null;
  nightly_rate: number;
}

export interface Booking {
  id: string;
  guest_name: string;
  guest_phone: string | null;
  check_in: string;
  check_out: string;
  nights: number;
  nightly_rate: number;
  total_amount: number;
  paid_amount: number;
  status: string;
  room: { code: string; name: string | null } | null;
}

const STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'warning' | 'secondary' | 'info'> = {
  reserved: 'info',
  checked_in: 'success',
  checked_out: 'secondary',
  cancelled: 'destructive',
};

const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function BookingsManager({ bookings, rooms }: { bookings: Booking[]; rooms: RoomOption[] }) {
  const router = useRouter();
  const prompt = usePrompt();
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) { toast.error(res.error ?? t('hotel.bookings.errorGeneric')); return; }
      toast.success(ok);
      router.refresh();
    });
  }

  function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      const res = await createBooking(fd);
      if (!res.ok) { toast.error(res.error ?? t('hotel.bookings.errorGeneric')); return; }
      toast.success(t('hotel.bookings.toastCreated'));
      form.reset();
      setAdding(false);
      router.refresh();
    });
  }

  function collect(b: Booking) {
    const remaining = b.total_amount - b.paid_amount;
    prompt({
      title: t('hotel.bookings.collectTitle'),
      message: t('hotel.bookings.collectMessage', { name: b.guest_name, remaining: formatNumber(remaining) }),
      label: t('hotel.bookings.collectLabel'),
      type: 'number',
      defaultValue: remaining > 0 ? String(remaining) : '',
      confirmText: t('hotel.bookings.collectConfirm'),
    }).then((raw) => {
      if (raw == null) return;
      const amount = Number(raw);
      if (!Number.isFinite(amount) || amount <= 0) { toast.error(t('hotel.bookings.errorInvalidAmount')); return; }
      run(() => addBookingPayment(b.id, amount), t('hotel.bookings.toastPaymentRecorded'));
    });
  }

  return (
    <div className="space-y-4">
      <div>
        {!adding ? (
          <Button onClick={() => setAdding(true)} disabled={rooms.length === 0}>
            <Plus className="h-4 w-4" /> {t('hotel.bookings.newBooking')}
          </Button>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <select name="room_id" className={selectCls} required defaultValue="">
                  <option value="" disabled>{t('hotel.bookings.selectRoom')}</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code}{r.name ? ` — ${r.name}` : ''} ({formatNumber(r.nightly_rate)}{t('hotel.bookings.perNight')})
                    </option>
                  ))}
                </select>
                <Input name="guest_name" placeholder={t('hotel.bookings.placeholderGuestName')} required />
                <Input name="guest_phone" placeholder={t('hotel.bookings.placeholderGuestPhone')} dir="ltr" />
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('hotel.bookings.labelCheckIn')}</label>
                  <Input name="check_in" type="date" dir="ltr" required />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('hotel.bookings.labelCheckOut')}</label>
                  <Input name="check_out" type="date" dir="ltr" required />
                </div>
                <div className="flex items-end gap-2">
                  <Button type="submit" disabled={pending}>
                    {pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('hotel.bookings.save')}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setAdding(false)}>{t('hotel.bookings.cancel')}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
        {rooms.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">{t('hotel.bookings.noRoomsHint')}</p>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {bookings.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">{t('hotel.bookings.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-right font-medium">{t('hotel.bookings.colGuest')}</th>
                    <th className="p-3 text-right font-medium">{t('hotel.bookings.colRoom')}</th>
                    <th className="p-3 text-center font-medium">{t('hotel.bookings.colDates')}</th>
                    <th className="p-3 text-center font-medium">{t('hotel.bookings.colNights')}</th>
                    <th className="p-3 text-center font-medium">{t('hotel.bookings.colTotal')}</th>
                    <th className="p-3 text-center font-medium">{t('hotel.bookings.colPaid')}</th>
                    <th className="p-3 text-center font-medium">{t('hotel.bookings.colStatus')}</th>
                    <th className="p-3 text-center font-medium">{t('hotel.bookings.colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => {
                    const statusKey = `hotel.bookingStatus.${b.status}` as const;
                    const label = t(statusKey) !== statusKey ? t(statusKey) : b.status;
                    const variant = STATUS_VARIANT[b.status] ?? 'secondary';
                    const remaining = b.total_amount - b.paid_amount;
                    return (
                      <tr key={b.id} className="border-b">
                        <td className="p-3">
                          <div className="font-medium">{b.guest_name}</div>
                          {b.guest_phone && <div className="text-xs text-muted-foreground" dir="ltr">{b.guest_phone}</div>}
                        </td>
                        <td className="p-3" dir="ltr">{b.room?.code ?? '—'}</td>
                        <td className="p-3 text-center text-muted-foreground" dir="ltr">{b.check_in} → {b.check_out}</td>
                        <td className="p-3 text-center tabular-nums" dir="ltr">{b.nights}</td>
                        <td className="p-3 text-center tabular-nums" dir="ltr">{formatNumber(b.total_amount)}</td>
                        <td className="p-3 text-center tabular-nums" dir="ltr">
                          {formatNumber(b.paid_amount)}
                          {remaining > 0 && <span className="block text-xs text-destructive">{t('hotel.bookings.remaining', { amount: formatNumber(remaining) })}</span>}
                        </td>
                        <td className="p-3 text-center"><Badge variant={variant}>{label}</Badge></td>
                        <td className="p-3">
                          <div className="flex flex-wrap items-center justify-center gap-1">
                            {b.status === 'reserved' && (
                              <Button size="sm" variant="secondary" disabled={pending}
                                onClick={() => run(() => setBookingStatus(b.id, 'checked_in'), t('hotel.bookings.toastCheckedIn'))}>
                                <LogIn className="h-3.5 w-3.5" /> {t('hotel.bookings.btnCheckIn')}
                              </Button>
                            )}
                            {b.status === 'checked_in' && (
                              <Button size="sm" variant="secondary" disabled={pending}
                                onClick={() => run(() => setBookingStatus(b.id, 'checked_out'), t('hotel.bookings.toastCheckedOut'))}>
                                <LogOut className="h-3.5 w-3.5" /> {t('hotel.bookings.btnCheckOut')}
                              </Button>
                            )}
                            {(b.status === 'reserved' || b.status === 'checked_in') && (
                              <>
                                <Button size="sm" variant="outline" disabled={pending} onClick={() => collect(b)}>
                                  {t('hotel.bookings.btnCollect')}
                                </Button>
                                <Button size="sm" variant="ghost" disabled={pending}
                                  onClick={() => run(() => setBookingStatus(b.id, 'cancelled'), t('hotel.bookings.toastCancelled'))}>
                                  <X className="h-3.5 w-3.5" /> {t('hotel.bookings.btnCancel')}
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
