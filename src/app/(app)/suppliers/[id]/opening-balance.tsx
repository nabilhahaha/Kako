'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setSupplierOpeningBalance, reverseSupplierOpeningBalance } from './opening-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/confirm-dialog';
import { useI18n } from '@/lib/i18n/provider';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Loader2, Undo2, Wallet } from 'lucide-react';
import { toast } from 'sonner';

export interface SupplierOpeningRow {
  id: string;
  balance_type: 'credit' | 'debit';
  amount: number;
  as_of_date: string;
  note: string | null;
  status: 'active' | 'reversed';
}

const TYPE_KEY: Record<SupplierOpeningRow['balance_type'], string> = {
  credit: 'ops.obSupCredit',
  debit: 'ops.obSupDebit',
};

export function SupplierOpeningBalance({
  supplierId,
  existing,
}: {
  supplierId: string;
  existing: SupplierOpeningRow[];
}) {
  const router = useRouter();
  const { t } = useI18n();
  const confirm = useConfirm();
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'credit' | 'debit'>('credit');
  const [asOf, setAsOf] = useState('');
  const [note, setNote] = useState('');
  const [pending, startTransition] = useTransition();

  const active = existing.filter((e) => e.status === 'active');

  function onSave() {
    const a = Number(amount);
    if (!(a >= 0)) { toast.error(t('ops.obAmount')); return; }
    confirm({ title: t('ops.obSave'), message: t('ops.obConfirmMsg'), confirmText: t('ops.obSave') }).then((ok) => {
    if (!ok) return;
    startTransition(async () => {
      const res = await setSupplierOpeningBalance(supplierId, a, type, asOf || null, note.trim() || null);
      if (!res.ok) { toast.error(res.error ?? ''); return; }
      toast.success(t('ops.obToastSaved'));
      setAmount(''); setNote('');
      router.refresh();
    });
    });
  }

  function onReverse(id: string) {
    confirm({ title: t('ops.obReverse') }).then((ok) => {
      if (!ok) return;
      startTransition(async () => {
        const res = await reverseSupplierOpeningBalance(id, supplierId);
        if (!res.ok) { toast.error(res.error ?? ''); return; }
        toast.success(t('ops.obToastReversed'));
        router.refresh();
      });
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-2 font-semibold">
          <Wallet className="h-4 w-4" /> {t('ops.obTitle')}
        </div>

        {active.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t('ops.obExisting')}</p>
            {active.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{t(TYPE_KEY[e.balance_type])}</Badge>
                  <span className="font-medium tabular-nums" dir="ltr">{formatCurrency(e.amount)}</span>
                  <span className="text-xs text-muted-foreground" dir="ltr">{formatDate(e.as_of_date)}</span>
                  {e.note ? <span className="text-xs text-muted-foreground">— {e.note}</span> : null}
                </div>
                <Button size="sm" variant="ghost" className="h-8 gap-1" disabled={pending} onClick={() => onReverse(e.id)}>
                  <Undo2 className="h-3.5 w-3.5" /> {t('ops.obReverse')}
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('ops.obType')}</span>
            <select className="h-10 rounded-md border bg-background px-3" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="credit">{t('ops.obSupCredit')}</option>
              <option value="debit">{t('ops.obSupDebit')}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('ops.obAmount')}</span>
            <Input type="number" inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('ops.obAsOf')}</span>
            <Input type="date" dir="ltr" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('ops.obNote')}</span>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <div className="flex justify-end">
          <Button onClick={onSave} disabled={pending} className="gap-1.5">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('ops.obSave')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
