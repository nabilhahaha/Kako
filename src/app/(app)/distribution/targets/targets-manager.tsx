'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { setTarget } from '../actions';

export interface Rep { id: string; full_name: string | null; email: string | null }
export interface TargetRow { id: string; name: string; target_amount: number; commission_pct: number }

export function TargetsManager({ month, rows }: { month: string; rows: TargetRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function save(userId: string, target: number, commission: number) {
    startTransition(async () => {
      const res = await setTarget({ user_id: userId, month, target_amount: target, commission_pct: commission });
      if (!res.ok) { toast.error(res.error ?? 'حدث خطأ'); return; }
      toast.success('تم الحفظ'); router.refresh();
    });
  }

  return (
    <Card><CardContent className="p-0">
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="border-b bg-secondary/50 text-muted-foreground"><tr>
          <th className="p-3 text-right font-medium">المندوب</th>
          <th className="p-3 text-center font-medium">هدف المبيعات (شهري)</th>
          <th className="p-3 text-center font-medium">نسبة العمولة %</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b">
              <td className="p-3 font-medium">{r.name}</td>
              <td className="p-3 text-center">
                <Input type="number" min={0} step="0.01" dir="ltr" defaultValue={r.target_amount || ''} placeholder="0"
                  onBlur={(e) => { const v = Number(e.target.value || 0); if (v !== r.target_amount) save(r.id, v, r.commission_pct); }}
                  className="mx-auto h-8 w-32 text-center" />
              </td>
              <td className="p-3 text-center">
                <Input type="number" min={0} step="0.1" dir="ltr" defaultValue={r.commission_pct || ''} placeholder="0"
                  onBlur={(e) => { const v = Number(e.target.value || 0); if (v !== r.commission_pct) save(r.id, r.target_amount, v); }}
                  className="mx-auto h-8 w-24 text-center" />
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </CardContent></Card>
  );
}
