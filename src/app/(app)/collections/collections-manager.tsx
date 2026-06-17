'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Wallet } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useCriticalAction } from '@/lib/critical-action';
import { recordCollection, reverseCollection } from './actions';
import { loadActionPolicyConfig } from '../settings/action-policies/actions';

export interface ARCustomer { id: string; code: string; name: string; name_ar: string | null; balance: number; branch_id: string; }
export interface OpenInvoice { id: string; invoice_number: string; customer_id: string; branch_id: string; net_amount: number; paid_amount: number | null; due_date: string | null; created_at: string; status: string; }
export interface RecentCollection { id: string; collection_number: string; collection_date: string; amount: number; method: string; customer_id: string; status?: string | null; }

const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'card', label: 'Card' },
];

export function CollectionsManager({
  customers,
  openInvoices,
  recent,
  canReverse = false,
}: {
  customers: ARCustomer[];
  openInvoices: OpenInvoice[];
  recent: RecentCollection[];
  /** SoD: only Finance/Admin (accounting.post) may reverse a posted collection.
   *  When false (e.g. a Sales Rep), the Reverse control is not rendered at all.
   *  The server action enforces the same right, so hiding it is defence-in-depth. */
  canReverse?: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const runCritical = useCriticalAction();
  const [selected, setSelected] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  // BL-6: one stable idempotency key per submit attempt. Reused across a rapid
  // double-click (so the RPC dedupes instead of posting twice); cleared on success.
  const idemKey = useRef<string | null>(null);

  const invoicesByCustomer = useMemo(() => {
    const m = new Map<string, OpenInvoice[]>();
    for (const inv of openInvoices) (m.get(inv.customer_id) ?? m.set(inv.customer_id, []).get(inv.customer_id)!).push(inv);
    return m;
  }, [openInvoices]);

  const outstanding = (inv: OpenInvoice) => Number(inv.net_amount) - Number(inv.paid_amount ?? 0);
  const totalAR = customers.reduce((s, c) => s + Number(c.balance), 0);
  const sel = customers.find((c) => c.id === selected) ?? null;
  const selInvoices = selected ? invoicesByCustomer.get(selected) ?? [] : [];

  function openFor(c: ARCustomer) {
    setSelected(c.id);
    setAmount(String(Number(c.balance).toFixed(2)));
    setMethod('cash');
  }

  // Collection posting — irreversible (AR settlement); standard confirm + audit.
  async function submit() {
    if (!sel) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error(t('sales.collectionsErrAmount')); return; }
    await runCritical({
      catalogKey: 'collection.post',
      action: t('critical.actions.collectionPost'),
      record: `${nm(sel)} · ${formatCurrency(amt)}`,
      execute: async () => {
        setLoading(true);
        if (!idemKey.current) idemKey.current = crypto.randomUUID();
        const res = await recordCollection({ customerId: sel.id, branchId: sel.branch_id, amount: amt, method, date, idempotencyKey: idemKey.current });
        setLoading(false);
        return { ok: res.ok, error: res.error };
      },
      onDone: () => { idemKey.current = null; setSelected(null); setAmount(''); router.refresh(); },
    });
  }

  const nm = (c: { name: string; name_ar: string | null }) => (locale === 'ar' ? c.name_ar || c.name : c.name);

  // Collection reversal — consumes the tenant ACTION POLICY (collection.adjust):
  // reason requirement, irreversible styling and enablement come from the policy
  // engine, not hard-coded rules.
  async function onReverse(r: RecentCollection) {
    const policy = await loadActionPolicyConfig('collection.adjust');
    if (!policy.enabled) { toast.error(t('actionPolicies.disabledForTenant')); return; }
    await runCritical({
      catalogKey: 'collection.adjust',
      action: t('critical.actions.collectionAdjust'),
      record: `${r.collection_number} · ${formatCurrency(Number(r.amount))}`,
      requireReason: policy.reasonRequired,
      irreversible: policy.irreversible,
      execute: async (reason) => {
        const res = await reverseCollection(r.id, reason);
        return { ok: res.ok, error: res.error };
      },
      onDone: () => router.refresh(),
    });
  }

  return (
    <div className="space-y-4">
      {/* summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card><CardContent className="pt-6">
          <div className="text-xs text-muted-foreground">{t('sales.collectionsTotalAr')}</div>
          <div className="text-2xl font-bold">{formatCurrency(totalAR)}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-xs text-muted-foreground">{t('sales.collectionsCustomers')}</div>
          <div className="text-2xl font-bold">{customers.length}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-xs text-muted-foreground">{t('sales.collectionsOpenInvoices')}</div>
          <div className="text-2xl font-bold">{openInvoices.length}</div>
        </CardContent></Card>
      </div>

      {customers.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('sales.collectionsNone')}</CardContent></Card>
      ) : (
        <Card><CardContent className="p-0">
          {/* Mobile (< sm): stacked cards. */}
          <ul className="divide-y sm:hidden">
            {customers.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{nm(c)}</div>
                  <div className="truncate text-xs text-muted-foreground">{c.code} · {invoicesByCustomer.get(c.id)?.length ?? 0} {t('sales.collectionsColOpen')}</div>
                  <div className="text-sm font-semibold tabular-nums" dir="ltr">{formatCurrency(Number(c.balance))}</div>
                </div>
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => openFor(c)}>
                  <Wallet className="me-1 h-4 w-4" />{t('sales.collectionsRecord')}
                </Button>
              </li>
            ))}
          </ul>
          {/* Desktop (sm+): table. */}
          <table className="hidden w-full text-sm sm:table">
            <thead className="border-b bg-muted/40 text-start">
              <tr>
                <th className="p-3 text-start">{t('sales.collectionsColCustomer')}</th>
                <th className="p-3 text-end">{t('sales.collectionsColBalance')}</th>
                <th className="p-3 text-center">{t('sales.collectionsColOpen')}</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3"><div className="font-medium">{nm(c)}</div><div className="text-xs text-muted-foreground">{c.code}</div></td>
                  <td className="p-3 text-end font-semibold">{formatCurrency(Number(c.balance))}</td>
                  <td className="p-3 text-center">{invoicesByCustomer.get(c.id)?.length ?? 0}</td>
                  <td className="p-3 text-end">
                    <Button size="sm" variant="outline" onClick={() => openFor(c)}>
                      <Wallet className="me-1 h-4 w-4" />{t('sales.collectionsRecord')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}

      {/* collection panel */}
      {sel && (
        <Card><CardContent className="space-y-4 pt-6">
          <div className="font-semibold">{nm(sel)} — {formatCurrency(Number(sel.balance))}</div>

          {selInvoices.length > 0 && (
            <>
              {/* Mobile (< sm): stacked rows. */}
              <ul className="divide-y sm:hidden">
                {selInvoices.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0 break-all font-mono text-xs" dir="ltr">{inv.invoice_number}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{inv.due_date ? formatDate(inv.due_date) : '—'}</span>
                    <span className="shrink-0 font-semibold tabular-nums" dir="ltr">{formatCurrency(outstanding(inv))}</span>
                  </li>
                ))}
              </ul>
              {/* Desktop (sm+): table. */}
              <table className="hidden w-full text-sm sm:table">
                <thead className="border-b text-muted-foreground">
                  <tr>
                    <th className="p-2 text-start">{t('sales.collectionsColInvoice')}</th>
                    <th className="p-2 text-start">{t('sales.collectionsColDue')}</th>
                    <th className="p-2 text-end">{t('sales.collectionsColOutstanding')}</th>
                  </tr>
                </thead>
                <tbody>
                  {selInvoices.map((inv) => (
                    <tr key={inv.id} className="border-b last:border-0">
                      <td className="p-2">{inv.invoice_number}</td>
                      <td className="p-2">{inv.due_date ? formatDate(inv.due_date) : '—'}</td>
                      <td className="p-2 text-end">{formatCurrency(outstanding(inv))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1"><Label>{t('sales.collectionsAmount')}</Label>
              <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-40" /></div>
            <div className="space-y-1"><Label>{t('sales.collectionsMethod')}</Label>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select></div>
            <div className="space-y-1"><Label>{t('sales.collectionsDate')}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" /></div>
            <Button onClick={submit} disabled={loading}>
              {loading ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : <Wallet className="me-1 h-4 w-4" />}
              {t('sales.collectionsSubmit')}
            </Button>
            <Button variant="ghost" onClick={() => setSelected(null)}>{t('sales.btnCancel')}</Button>
          </div>
        </CardContent></Card>
      )}

      {/* recent */}
      {recent.length > 0 && (
        <Card><CardContent className="pt-6">
          <div className="mb-2 text-sm font-semibold">{t('sales.collectionsRecent')}</div>
          <div className="space-y-1 text-sm">
            {recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between border-b py-1 last:border-0">
                <span>{r.collection_number} · {formatDate(r.collection_date)}</span>
                <span className="flex items-center gap-2">
                  <span className="font-medium">{formatCurrency(Number(r.amount))}</span>
                  {r.status === 'reversed' ? (
                    <span className="text-xs text-muted-foreground">{t('sales.collectionsReversed')}</span>
                  ) : canReverse ? (
                    // SoD: only Finance/Admin (accounting.post) sees the Reverse
                    // control. A Sales Rep gets no Reverse button at all.
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => onReverse(r)}>
                      {t('sales.collectionsReverse')}
                    </Button>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        </CardContent></Card>
      )}
    </div>
  );
}
