'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { HandCoins, Check, Loader2, ReceiptText, Share2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n/provider';
import { allocatePayment } from '@/lib/distribution/collections/allocation';
import { loadCustomerOutstanding, settleCollectionEntry, type OutstandingInvoiceView } from '@/lib/van-sales/collect-server';

export interface CollectCustomer { id: string; name: string; name_ar: string | null; code: string; balance: number }

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function CollectScreen({
  branchId, customers, preselectCustomerId,
}: {
  branchId: string;
  customers: CollectCustomer[];
  preselectCustomerId: string | null;
}) {
  const { t, locale } = useI18n();
  const ar = locale === 'ar';
  const router = useRouter();

  const preselect = preselectCustomerId && customers.some((c) => c.id === preselectCustomerId) ? preselectCustomerId : '';
  const [customerId, setCustomerId] = useState(preselect);
  const [invoices, setInvoices] = useState<OutstandingInvoiceView[]>([]);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState(0);
  const [specify, setSpecify] = useState(false);
  const [perInvoice, setPerInvoice] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ number: string; applied: number; unapplied: number } | null>(null);
  const [key, setKey] = useState(() => uuid());

  const cName = (c: CollectCustomer) => (ar && c.name_ar ? c.name_ar : c.name);
  const money = (n: number) => n.toFixed(2);
  const totalOutstanding = useMemo(() => invoices.reduce((s, i) => s + i.outstanding, 0), [invoices]);

  async function pickCustomer(id: string) {
    setCustomerId(id); setInvoices([]); setAmount(0); setPerInvoice({}); setSpecify(false); setDone(null);
    if (!id) return;
    setLoading(true);
    try {
      const res = await loadCustomerOutstanding(branchId, id);
      if (!res.ok || !res.data) { toast.error(res.error ?? t('vanSales.collect.error')); return; }
      setInvoices(res.data);
      setAmount(Number(res.data.reduce((s, i) => s + i.outstanding, 0).toFixed(2)));
    } finally { setLoading(false); }
  }

  // Live preview via the SAME pure allocation policy the RPC commits.
  const preview = useMemo(() => {
    const alloc = invoices.map((i) => ({ id: i.id, outstanding: i.outstanding, date: i.date }));
    if (specify) {
      const total = Object.values(perInvoice).reduce((s, n) => s + (Number(n) || 0), 0);
      return allocatePayment(total, alloc, { specified: perInvoice });
    }
    return allocatePayment(amount, alloc, {});
  }, [invoices, amount, specify, perInvoice]);

  const appliedByInvoice = useMemo(() => new Map(preview.allocations.map((a) => [a.invoiceId, a.applied])), [preview]);
  const effectiveAmount = specify ? preview.totalApplied + preview.unapplied : amount;

  async function settle() {
    if (!customerId) { toast.error(t('vanSales.collect.pickCustomer')); return; }
    if (!(effectiveAmount > 0)) { toast.error(t('vanSales.collect.amountRequired')); return; }
    setBusy(true);
    try {
      const res = await settleCollectionEntry({
        branch_id: branchId, customer_id: customerId, amount: Number(effectiveAmount), idempotency_key: key,
        specified: specify ? perInvoice : undefined,
      });
      if (!res.ok || !res.data) { toast.error(res.error ?? t('vanSales.collect.error')); return; }
      setDone({ number: res.data.collectionNumber, applied: res.data.totalApplied, unapplied: res.data.unapplied });
      toast.success(t('vanSales.collect.done', { number: res.data.collectionNumber }));
    } finally { setBusy(false); }
  }

  function reset() {
    setDone(null); setInvoices([]); setAmount(0); setPerInvoice({}); setSpecify(false);
    setKey(uuid()); setCustomerId(preselect);
    if (preselect) pickCustomer(preselect);
  }

  async function share() {
    if (!done) return;
    const text = t('vanSales.collect.shareText', { number: done.number, amount: done.applied.toFixed(2) });
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ title: done.number, text }); } catch { /* cancelled */ }
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text); toast.success(t('vanSales.collect.share'));
    }
  }

  if (done) {
    return (
      <Card>
        <CardContent className="space-y-4 pt-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15"><Check className="h-6 w-6 text-success" /></div>
          <div>
            <div className="text-sm text-muted-foreground">{t('vanSales.collect.completed')}</div>
            <div className="text-lg font-bold">{t('vanSales.collect.done', { number: done.number })}</div>
            <div className="mt-1 text-sm text-muted-foreground" dir="ltr">
              {t('vanSales.collect.applied')} {money(done.applied)}
              {done.unapplied > 0 && <> · {t('vanSales.collect.onAccount')} {money(done.unapplied)}</>}
            </div>
          </div>
          {/* Transaction completed → Share / Continue (collection-receipt print is a known gap) */}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={share}><Share2 className="h-4 w-4" /> {t('vanSales.collect.share')}</Button>
            <Button onClick={reset}><ReceiptText className="h-4 w-4" /> {t('vanSales.collect.newCollection')}</Button>
          </div>
          <Button variant="ghost" className="w-full" onClick={() => router.push('/field/van-sales')}>{t('vanSales.collect.back')}</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="space-y-1.5">
          <Label>{t('vanSales.collect.customer')}</Label>
          <Select value={customerId} onChange={(e) => pickCustomer(e.target.value)}>
            <option value="">{t('vanSales.collect.pickCustomer')}</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{cName(c)} · {c.code}</option>)}
          </Select>
        </div>

        {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t('vanSales.collect.loading')}</p>}

        {customerId && !loading && invoices.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">{t('vanSales.collect.noOutstanding')}</p>
        )}

        {invoices.length > 0 && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('vanSales.collect.outstanding')}</span>
              <span className="font-bold tabular-nums" dir="ltr">{money(totalOutstanding)}</span>
            </div>

            {!specify && (
              <div className="space-y-1.5">
                <Label>{t('vanSales.collect.amount')}</Label>
                <Input type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
              </div>
            )}

            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={specify} onChange={(e) => setSpecify(e.target.checked)} /> {t('vanSales.collect.specify')}
            </label>

            <ul className="divide-y rounded-md border">
              {invoices.map((inv) => {
                const applied = appliedByInvoice.get(inv.id) ?? 0;
                return (
                  <li key={inv.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{inv.invoiceNumber}</span>
                      <span className="block text-xs text-muted-foreground" dir="ltr">{t('vanSales.collect.due')} {money(inv.outstanding)}</span>
                    </span>
                    {specify ? (
                      <Input type="number" inputMode="decimal" min={0} max={inv.outstanding} className="h-8 w-24"
                        value={perInvoice[inv.id] ?? ''} placeholder="0"
                        onChange={(e) => setPerInvoice((p) => ({ ...p, [inv.id]: Number(e.target.value) }))} />
                    ) : (
                      applied > 0 && <span className="shrink-0 font-medium tabular-nums text-success" dir="ltr">−{money(applied)}</span>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="space-y-1 border-t pt-3 text-sm">
              <div className="flex items-center justify-between"><span className="text-muted-foreground">{t('vanSales.collect.willApply')}</span><span className="font-medium tabular-nums" dir="ltr">{money(preview.totalApplied)}</span></div>
              {preview.unapplied > 0 && <div className="flex items-center justify-between"><span className="text-muted-foreground">{t('vanSales.collect.onAccount')}</span><span className="tabular-nums" dir="ltr">{money(preview.unapplied)}</span></div>}
            </div>

            <Button className="w-full" size="lg" disabled={busy || !(effectiveAmount > 0)} onClick={settle}>
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> {t('vanSales.collect.settling')}</> : <><HandCoins className="h-4 w-4" /> {t('vanSales.collect.settle')}</>}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
