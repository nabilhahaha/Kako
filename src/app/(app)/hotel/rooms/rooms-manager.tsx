'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2 } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { createRoom, setRoomStatus } from '../actions';

export interface Room {
  id: string;
  code: string;
  name: string | null;
  room_type: string | null;
  capacity: number;
  nightly_rate: number;
  status: string;
  is_active: boolean;
}

const STATUS: Record<string, { label: string; variant: 'success' | 'destructive' | 'warning' | 'secondary' }> = {
  available: { label: 'متاحة', variant: 'success' },
  occupied: { label: 'مشغولة', variant: 'destructive' },
  cleaning: { label: 'تنظيف', variant: 'warning' },
  maintenance: { label: 'صيانة', variant: 'secondary' },
};

const selectCls =
  'flex h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function RoomsManager({ rooms }: { rooms: Room[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);

  function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      const res = await createRoom(fd);
      if (!res.ok) { toast.error(res.error ?? 'حدث خطأ'); return; }
      toast.success('تمت إضافة الغرفة');
      form.reset();
      setAdding(false);
      router.refresh();
    });
  }

  function changeStatus(id: string, status: string) {
    startTransition(async () => {
      const res = await setRoomStatus(id, status);
      if (!res.ok) { toast.error(res.error ?? 'حدث خطأ'); return; }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div>
        {!adding ? (
          <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> غرفة جديدة</Button>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Input name="code" placeholder="رقم الغرفة *" required dir="ltr" />
                <Input name="name" placeholder="الاسم (اختياري)" />
                <Input name="room_type" placeholder="النوع (مفرد/جناح)" />
                <Input name="capacity" type="number" min={1} defaultValue={2} placeholder="السعة" dir="ltr" />
                <Input name="nightly_rate" type="number" min={0} step="0.01" placeholder="سعر الليلة" dir="ltr" />
                <div className="flex gap-2">
                  <Button type="submit" disabled={pending}>
                    {pending && <Loader2 className="h-4 w-4 animate-spin" />} إضافة
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setAdding(false)}>إلغاء</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {rooms.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">لا توجد غرف بعد. أضف أول غرفة.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-right font-medium">الغرفة</th>
                    <th className="p-3 text-right font-medium">النوع</th>
                    <th className="p-3 text-center font-medium">السعة</th>
                    <th className="p-3 text-center font-medium">سعر الليلة</th>
                    <th className="p-3 text-center font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((r) => {
                    const st = STATUS[r.status] ?? { label: r.status, variant: 'secondary' as const };
                    return (
                      <tr key={r.id} className="border-b">
                        <td className="p-3">
                          <span className="font-medium" dir="ltr">{r.code}</span>
                          {r.name && <span className="mr-2 text-muted-foreground">{r.name}</span>}
                        </td>
                        <td className="p-3 text-muted-foreground">{r.room_type || '—'}</td>
                        <td className="p-3 text-center tabular-nums" dir="ltr">{r.capacity}</td>
                        <td className="p-3 text-center tabular-nums" dir="ltr">{formatNumber(r.nightly_rate)}</td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Badge variant={st.variant}>{st.label}</Badge>
                            <select
                              className={selectCls}
                              value={r.status}
                              disabled={pending}
                              onChange={(e) => changeStatus(r.id, e.target.value)}
                            >
                              <option value="available">متاحة</option>
                              <option value="occupied">مشغولة</option>
                              <option value="cleaning">تنظيف</option>
                              <option value="maintenance">صيانة</option>
                            </select>
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
