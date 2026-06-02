'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { setTarget } from '../actions';
import { useI18n } from '@/lib/i18n/provider';

export interface Rep { id: string; full_name: string | null; email: string | null }
export interface TargetRow { id: string; name: string; target_amount: number; commission_pct: number }

export function TargetsManager({ month, rows }: { month: string; rows: TargetRow[] }) {
  const router = useRouter();
  const { t } = useI18n();
  const [, startTransition] = useTransition();

  function save(userId: string, target: number, commission: number) {
    startTransition(async () => {
      const res = await setTarget({ user_id: userId, month, target_amount: target, commission_pct: commission });
      if (!res.ok) { toast.error(res.error ?? t('distribution.targetsToastError')); return; }
      toast.success(t('distribution.targetsToastSaved')); router.refresh();
    });
  }

  return (
    <Card><CardContent className="p-0">
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="border-b bg-secondary/50 text-muted-foreground"><tr>
          <th className="p-3 text-start font-medium">{t('distribution.targetsColRep')}</th>
          <th className="p-3 text-center font-medium">{t('distribution.targetsColSalesTarget')}</th>
          <th className="p-3 text-center font-medium">{t('distribution.targetsColCommissionPct')}</th>
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
