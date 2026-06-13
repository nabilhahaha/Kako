'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Truck, Plus, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n/provider';
import { requestVanTransfer } from '../../field/actions';

type WH = { id: string; name: string; name_ar: string | null };
type Prod = { id: string; name: string; name_ar: string | null; code: string | null };
interface Line { product_id: string; quantity: number }

export function VanTransferForm({ warehouses, products }: { warehouses: WH[]; products: Prod[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [lines, setLines] = useState<Line[]>([{ product_id: '', quantity: 1 }]);
  const nm = (o: { name: string; name_ar: string | null }) => (locale === 'ar' ? o.name_ar || o.name : o.name);

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, { product_id: '', quantity: 1 }]);
  const removeLine = (i: number) => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls));

  function submit() {
    if (!from || !to) { toast.error(t('transferReq.selectRequired')); return; }
    if (from === to) { toast.error(t('transferReq.sameWarehouse')); return; }
    const valid = lines.filter((l) => l.product_id && l.quantity > 0);
    if (valid.length === 0) { toast.error(t('transferReq.noLines')); return; }
    start(async () => {
      const res = await requestVanTransfer(from, to, valid);
      if (res.ok) {
        toast.success(t('transferReq.success'));
        router.push('/approvals/queue');
      } else {
        toast.error(res.error ?? t('transferReq.error'));
      }
    });
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold"><Truck className="h-5 w-5 text-primary" />{t('transferReq.vanTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('transferReq.vanDesc')}</p>
      </div>
      <Card><CardContent className="space-y-4 p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t('transferReq.fromWarehouse')}</Label>
            <Select value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">—</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{nm(w)}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('transferReq.toWarehouse')}</Label>
            <Select value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">—</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{nm(w)}</option>)}
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t('transferReq.product')}</Label>
          {lines.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select className="flex-1" value={l.product_id} onChange={(e) => setLine(i, { product_id: e.target.value })}>
                <option value="">—</option>
                {products.map((p) => <option key={p.id} value={p.id}>{nm(p)}{p.code ? ` (${p.code})` : ''}</option>)}
              </Select>
              <Input
                type="number" min={1} className="w-20"
                value={l.quantity}
                onChange={(e) => setLine(i, { quantity: Number(e.target.value) })}
                aria-label={t('transferReq.qty')}
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(i)} aria-label={t('transferReq.removeLine')}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            <Plus className="me-1 h-4 w-4" />{t('transferReq.addLine')}
          </Button>
        </div>

        <Button className="w-full" disabled={pending} onClick={submit}>
          {pending ? t('transferReq.submitting') : t('transferReq.submit')}
        </Button>
      </CardContent></Card>
    </div>
  );
}
