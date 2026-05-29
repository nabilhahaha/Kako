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

const STATUS: Record<string, { label: string; variant: 'success' | 'destructive' | 'warning' | 'secondary' | 'info' }> = {
  reserved: { label: 'محجوزة', variant: 'info' },
  checked_in: { label: 'تسجيل دخول', variant: 'success' },
  checked_out: { label: 'تسجيل خروج', variant: 'secondary' },
  cancelled: { label: 'ملغاة', variant: 'destructive' },
};

const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function BookingsManager({ bookings, rooms }: { bookings: Booking[]; rooms: RoomOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);

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
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      const res = await createBooking(fd);
      if (!res.ok) { toast.error(res.error ?? 'حدث خطأ'); return; }
      toast.success('تم إنشاء الحجز');
      form.reset();
      setAdding(false);
      router.refresh();
    });
  }

  function collect(b: Booking) {
    const remaining = b.total_amount - b.paid_amount;
    const raw = window.prompt('مبلغ التحصيل', remaining > 0 ? String(remaining) : '');
    if (raw == null) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) { toast.error('مبلغ غير صحيح'); return; }
    run(() => addBookingPayment(b.id, amount), 'تم تسجيل الدفعة');
  }

  return (
    <div className="space-y-4">
      <div>
        {!adding ? (
          <Button onClick={() => setAdding(true)} disabled={rooms.length === 0}>
            <Plus className="h-4 w-4" /> حجز جديد
          </Button>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <select name="room_id" className={selectCls} required defaultValue="">
                  <option value="" disabled>اختر الغرفة *</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code}{r.name ? ` — ${r.name}` : ''} ({formatNumber(r.nightly_rate)}/ليلة)
                    </option>
                  ))}
                </select>
                <Input name="guest_name" placeholder="اسم النزيل *" required />
                <Input name="guest_phone" placeholder="هاتف النزيل" dir="ltr" />
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">تاريخ الدخول</label>
                  <Input name="check_in" type="date" dir="ltr" required />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">تاريخ الخروج</label>
                  <Input name="check_out" type="date" dir="ltr" required />
                </div>
                <div className="flex items-end gap-2">
                  <Button type="submit" disabled={pending}>
                    {pending && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setAdding(false)}>إلغاء</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
        {rooms.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">أضف غرفة أولاً من صفحة الغرف.</p>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {bookings.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">لا توجد حجوزات بعد.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-right font-medium">النزيل</th>
                    <th className="p-3 text-right font-medium">الغرفة</th>
                    <th className="p-3 text-center font-medium">الدخول → الخروج</th>
                    <th className="p-3 text-center font-medium">الليالي</th>
                    <th className="p-3 text-center font-medium">الإجمالي</th>
                    <th className="p-3 text-center font-medium">المدفوع</th>
                    <th className="p-3 text-center font-medium">الحالة</th>
                    <th className="p-3 text-center font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => {
                    const st = STATUS[b.status] ?? { label: b.status, variant: 'secondary' as const };
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
                          {remaining > 0 && <span className="block text-xs text-destructive">باقي {formatNumber(remaining)}</span>}
                        </td>
                        <td className="p-3 text-center"><Badge variant={st.variant}>{st.label}</Badge></td>
                        <td className="p-3">
                          <div className="flex flex-wrap items-center justify-center gap-1">
                            {b.status === 'reserved' && (
                              <Button size="sm" variant="secondary" disabled={pending}
                                onClick={() => run(() => setBookingStatus(b.id, 'checked_in'), 'تم تسجيل الدخول')}>
                                <LogIn className="h-3.5 w-3.5" /> دخول
                              </Button>
                            )}
                            {b.status === 'checked_in' && (
                              <Button size="sm" variant="secondary" disabled={pending}
                                onClick={() => run(() => setBookingStatus(b.id, 'checked_out'), 'تم تسجيل الخروج')}>
                                <LogOut className="h-3.5 w-3.5" /> خروج
                              </Button>
                            )}
                            {(b.status === 'reserved' || b.status === 'checked_in') && (
                              <>
                                <Button size="sm" variant="outline" disabled={pending} onClick={() => collect(b)}>
                                  تحصيل
                                </Button>
                                <Button size="sm" variant="ghost" disabled={pending}
                                  onClick={() => run(() => setBookingStatus(b.id, 'cancelled'), 'تم الإلغاء')}>
                                  <X className="h-3.5 w-3.5" /> إلغاء
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
