'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Wallet } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { recordCollection } from './actions';

export interface ARCustomer { id: string; code: string; name: string; name_ar: string | null; balance: number; branch_id: string; }
export interface OpenInvoice { id: string; invoice_number: string; customer_id: string; branch_id: string; net_amount: number; paid_amount: number | null; due_date: string | null; created_at: string; status: string; }
export interface RecentCollection { collection_number: string; collection_date: string; amount: number; method: string; customer_id: string; }

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
}: {
  customers: ARCustomer[];
  openInvoices: OpenInvoice[];
  recent: RecentCollection[];
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

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

  async function submit() {
    if (!sel) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error(t('sales.collectionsErrAmount')); return; }
    setLoading(true);
    const res = await recordCollection({ customerId: sel.id, branchId: sel.branch_id, amount: amt, method, date });
    setLoading(false);
    if (!res.ok) { toast.error(res.error || t('sales.errorGeneric')); return; }
    toast.success(t('sales.collectionsSuccess'));
    setSelected(null);
    setAmount('');
    router.refresh();
  }

  const nm = (c: { name: string; name_ar: string | null }) => (locale === 'ar' ? c.name_ar || c.name : c.name);

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
          <table className="w-full text-sm">
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
            <table className="w-full text-sm">
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
              <div key={r.collection_number} className="flex justify-between border-b py-1 last:border-0">
                <span>{r.collection_number} · {formatDate(r.collection_date)}</span>
                <span className="font-medium">{formatCurrency(Number(r.amount))}</span>
              </div>
            ))}
          </div>
        </CardContent></Card>
      )}
    </div>
  );
}
