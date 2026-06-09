'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2, Undo2, Check, Loader2, ReceiptText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n/provider';
import { previewVanReturn, vanReturn } from '@/lib/van-sales/returns-server';

export interface ReturnCustomer { id: string; name: string; name_ar: string | null; code: string }
export interface ReturnProduct { id: string; name: string; name_ar: string | null; code: string }
export interface ReturnReason { id: string; code: string; label_en: string | null; label_ar: string | null }

interface Line { productId: string; quantity: number }

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ReturnScreen({
  branchId, customers, products, reasons, preselectCustomerId,
}: {
  branchId: string;
  customers: ReturnCustomer[];
  products: ReturnProduct[];
  reasons: ReturnReason[];
  preselectCustomerId: string | null;
}) {
  const { t, locale } = useI18n();
  const ar = locale === 'ar';
  const router = useRouter();

  const preselect = preselectCustomerId && customers.some((c) => c.id === preselectCustomerId) ? preselectCustomerId : '';
  const [customerId, setCustomerId] = useState(preselect);
  const [reasonId, setReasonId] = useState('');
  const [lines, setLines] = useState<Line[]>([{ productId: '', quantity: 1 }]);
  const [creditNote, setCreditNote] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; returnNumber: string; creditNoteId: string | null } | null>(null);
  const [key, setKey] = useState(() => uuid());

  const cName = (c: ReturnCustomer) => (ar && c.name_ar ? c.name_ar : c.name);
  const pName = (p: ReturnProduct) => (ar && p.name_ar ? p.name_ar : p.name);
  const rName = (r: ReturnReason) => (ar && r.label_ar ? r.label_ar : r.label_en ?? r.code);

  const validLines = useMemo(() => lines.filter((l) => l.productId && l.quantity > 0), [lines]);
  function setLine(i: number, patch: Partial<Line>) { setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l))); setTotal(null); }

  async function preview() {
    if (!customerId || validLines.length === 0) return;
    setBusy(true);
    try {
      const res = await previewVanReturn({ branch_id: branchId, customer_id: customerId, lines: validLines.map((l) => ({ product_id: l.productId, quantity: l.quantity })) });
      if (!res.ok || !res.data) { toast.error(res.error ?? t('vanSales.return.error')); return; }
      setTotal(res.data.total);
    } finally { setBusy(false); }
  }

  async function submit() {
    if (!customerId) { toast.error(t('vanSales.sell.pickCustomer')); return; }
    if (!reasonId) { toast.error(t('vanSales.return.reasonRequired')); return; }
    if (validLines.length === 0) { toast.error(t('vanSales.return.emptyCart')); return; }
    setBusy(true);
    try {
      const res = await vanReturn({
        branch_id: branchId, customer_id: customerId, reason_id: reasonId, idempotency_key: key,
        create_credit_note: creditNote,
        lines: validLines.map((l) => ({ product_id: l.productId, quantity: l.quantity })),
      });
      if (!res.ok || !res.data) { toast.error(res.error ?? t('vanSales.return.error')); return; }
      setDone({ id: res.data.id, returnNumber: res.data.returnNumber, creditNoteId: res.data.creditNoteId });
      toast.success(t('vanSales.return.done', { number: res.data.returnNumber }));
    } finally { setBusy(false); }
  }

  function reset() {
    setDone(null); setTotal(null); setLines([{ productId: '', quantity: 1 }]);
    setReasonId(''); setCreditNote(false); setKey(uuid()); setCustomerId(preselect);
  }

  if (done) {
    return (
      <Card>
        <CardContent className="space-y-4 pt-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15"><Check className="h-6 w-6 text-success" /></div>
          <div className="text-lg font-bold">{t('vanSales.return.done', { number: done.returnNumber })}</div>
          {done.creditNoteId && <div className="text-sm text-muted-foreground">{t('vanSales.return.creditNoteIssued', { number: `CN-${done.returnNumber}` })}</div>}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => router.push('/field/van-sales')}>{t('vanSales.return.back')}</Button>
            <Button onClick={reset}><ReceiptText className="h-4 w-4" /> {t('vanSales.return.newReturn')}</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="space-y-1.5">
          <Label>{t('vanSales.return.stepCustomer')}</Label>
          <Select value={customerId} onChange={(e) => { setCustomerId(e.target.value); setTotal(null); }}>
            <option value="">{t('vanSales.return.pickCustomer')}</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{cName(c)} · {c.code}</option>)}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>{t('vanSales.return.reason')} *</Label>
          <Select value={reasonId} onChange={(e) => setReasonId(e.target.value)}>
            <option value="">{t('vanSales.return.pickReason')}</option>
            {reasons.map((r) => <option key={r.id} value={r.id}>{rName(r)}</option>)}
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t('vanSales.return.stepProducts')}</Label>
          {lines.map((l, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Select value={l.productId} onChange={(e) => setLine(i, { productId: e.target.value })}>
                  <option value="">{t('vanSales.return.searchProduct')}</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{pName(p)}</option>)}
                </Select>
              </div>
              <div className="w-24 space-y-1.5">
                <Input type="number" inputMode="numeric" min={1} value={l.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} aria-label={t('vanSales.return.qty')} />
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => { setLines((ls) => ls.filter((_, j) => j !== i)); setTotal(null); }} aria-label="−"><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={() => setLines((ls) => [...ls, { productId: '', quantity: 1 }])}><Plus className="h-4 w-4" /></Button>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={creditNote} onChange={(e) => setCreditNote(e.target.checked)} /> {t('vanSales.return.creditNote')}
        </label>

        {total != null && (
          <div className="flex items-center justify-between border-t pt-3 text-base font-bold">
            <span>{t('vanSales.return.total')}</span><span className="tabular-nums" dir="ltr">{total.toFixed(2)}</span>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" disabled={busy || validLines.length === 0 || !customerId} onClick={preview}>
            {busy && total == null ? <Loader2 className="h-4 w-4 animate-spin" /> : t('vanSales.return.review')}
          </Button>
          <Button className="flex-[2]" disabled={busy} onClick={submit}>
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> {t('vanSales.return.submitting')}</> : <><Undo2 className="h-4 w-4" /> {t('vanSales.return.submit')}</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
