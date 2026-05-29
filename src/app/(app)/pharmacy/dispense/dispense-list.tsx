'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2, Search, Pill, ShieldAlert } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { createDispense } from '../actions';

export interface DispenseRow { id: string; status: string; patient_name: string | null; doctor_name: string | null; rx_number: string | null; is_controlled: boolean; dispensed_at: string; item_count: number }

const STATUS: Record<string, { label: string; variant: 'secondary' | 'warning' | 'success' | 'destructive' }> = {
  open: { label: 'مفتوح', variant: 'warning' }, done: { label: 'تم الصرف', variant: 'success' }, cancelled: { label: 'ملغي', variant: 'destructive' },
};

export function DispenseList({ rows }: { rows: DispenseRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => (r.patient_name || '').toLowerCase().includes(s) || (r.doctor_name || '').toLowerCase().includes(s) || (r.rx_number || '').toLowerCase().includes(s));
  }, [rows, q]);

  function start() {
    startTransition(async () => {
      const res = await createDispense();
      if (!res.ok || !res.data) { toast.error(res.error ?? 'تعذّر فتح السجل'); return; }
      router.push(`/pharmacy/dispense/${res.data}`);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button disabled={pending} onClick={start}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} صرف جديد</Button>
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث: مريض / طبيب / رقم روشتة…" className="w-64 pr-9" />
        </div>
      </div>

      <Card><CardContent className="p-0">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground"><Pill className="h-8 w-8" /><p>{rows.length === 0 ? 'لا عمليات صرف بعد.' : 'لا نتائج.'}</p></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="border-b bg-secondary/50 text-muted-foreground"><tr>
              <th className="p-3 text-right font-medium">التاريخ</th><th className="p-3 text-right font-medium">المريض</th><th className="p-3 text-right font-medium">الطبيب</th><th className="p-3 text-right font-medium">روشتة</th><th className="p-3 text-center font-medium">أصناف</th><th className="p-3 text-center font-medium">الحالة</th>
            </tr></thead>
            <tbody>
              {filtered.map((r) => {
                const st = STATUS[r.status] ?? { label: r.status, variant: 'secondary' as const };
                return (
                  <tr key={r.id} className="cursor-pointer border-b hover:bg-secondary/30" onClick={() => router.push(`/pharmacy/dispense/${r.id}`)}>
                    <td className="p-3 text-muted-foreground" dir="ltr">{formatDate(r.dispensed_at)}</td>
                    <td className="p-3 font-medium">{r.patient_name || '—'}{r.is_controlled && <ShieldAlert className="ms-1 inline h-3.5 w-3.5 text-destructive" />}</td>
                    <td className="p-3 text-muted-foreground">{r.doctor_name || '—'}</td>
                    <td className="p-3 text-muted-foreground" dir="ltr">{r.rx_number || '—'}</td>
                    <td className="p-3 text-center tabular-nums">{r.item_count}</td>
                    <td className="p-3 text-center"><Badge variant={st.variant}>{st.label}</Badge></td>
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
