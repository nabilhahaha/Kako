'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ShoppingCart, PackageCheck, RefreshCw } from 'lucide-react';
import {
  reorderSuggestions, createReorderPurchaseOrders, listPharmacyPurchaseOrders,
  receivePharmacyPurchaseOrder,
  type ReorderSuggestion, type PharmacyPO,
} from './actions';

type Tab = 'reorder' | 'orders';

interface Draft { qty: number; supplier_id: string; selected: boolean }

export function PurchasingManager({ suppliers }: {
  suppliers: Array<{ id: string; name: string; name_ar: string | null }>;
}) {
  const { t, locale } = useI18n();
  const intlLocale = locale === 'ar' ? 'ar-EG' : 'en-US';
  const money = (n: number | null | undefined) => formatCurrency(Number(n ?? 0), 'EGP', intlLocale);
  const nm = (x: { name: string; name_ar: string | null }) => (locale === 'ar' ? x.name_ar || x.name : x.name);

  const [tab, setTab] = useState<Tab>('reorder');
  const [rows, setRows] = useState<ReorderSuggestion[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [orders, setOrders] = useState<PharmacyPO[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [receiving, setReceiving] = useState<string | null>(null);

  async function loadReorder() {
    setLoading(true);
    const data = await reorderSuggestions();
    setRows(data);
    const d: Record<string, Draft> = {};
    for (const r of data) {
      d[r.product_id] = { qty: Number(r.suggested_qty), supplier_id: r.supplier_id ?? '', selected: false };
    }
    setDrafts(d);
    setLoading(false);
  }
  async function loadOrders() {
    setLoading(true);
    setOrders(await listPharmacyPurchaseOrders());
    setLoading(false);
  }

  useEffect(() => {
    if (tab === 'reorder') loadReorder();
    else loadOrders();
  }, [tab]);

  const setDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const allSelected = rows.length > 0 && rows.every((r) => drafts[r.product_id]?.selected);
  const toggleAll = () => {
    const v = !allSelected;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const r of rows) next[r.product_id] = { ...next[r.product_id], selected: v };
      return next;
    });
  };

  const selectedCount = rows.filter((r) => drafts[r.product_id]?.selected).length;

  async function createPos() {
    const items = rows
      .filter((r) => drafts[r.product_id]?.selected)
      .map((r) => {
        const d = drafts[r.product_id];
        return { product_id: r.product_id, quantity: Number(d.qty), unit_price: Number(r.last_cost ?? 0), supplier_id: d.supplier_id };
      });
    if (items.length === 0) { toast.error(t('pharmPurchasing.noneSelected')); return; }
    if (items.some((i) => !i.supplier_id)) { toast.error(t('pharmPurchasing.needSupplier')); return; }
    setBusy(true);
    const res = await createReorderPurchaseOrders(items);
    setBusy(false);
    if (!res.ok) { toast.error(res.error ?? t('pharmPurchasing.error')); return; }
    toast.success(t('pharmPurchasing.createdPos', { count: res.data?.created ?? 0 }));
    await loadReorder();
    setTab('orders');
  }

  async function receive(id: string) {
    setReceiving(id);
    const res = await receivePharmacyPurchaseOrder(id);
    setReceiving(null);
    if (!res.ok) { toast.error(res.error ?? t('pharmPurchasing.receiveError')); return; }
    toast.success(t('pharmPurchasing.received'));
    await loadOrders();
  }

  const statusVariant = (s: string): 'default' | 'secondary' | 'outline' =>
    s === 'received' ? 'default' : s === 'cancelled' ? 'outline' : 'secondary';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1">
        {(['reorder', 'orders'] as Tab[]).map((x) => (
          <button key={x} onClick={() => setTab(x)}
            className={`rounded-full px-3 py-1 text-sm ${tab === x ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}>
            {t(x === 'reorder' ? 'pharmPurchasing.tabReorder' : 'pharmPurchasing.tabOrders')}
          </button>
        ))}
        <Button variant="ghost" size="sm" className="ms-auto" onClick={() => (tab === 'reorder' ? loadReorder() : loadOrders())}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {tab === 'reorder' && (
        <Card><CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">…</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">{t('pharmPurchasing.none')}</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="p-2 text-start">
                        <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label={t('pharmPurchasing.selectAll')} />
                      </th>
                      <th className="p-2 text-start">{t('pharmPurchasing.product')}</th>
                      <th className="p-2 text-end">{t('pharmPurchasing.onHand')}</th>
                      <th className="p-2 text-end">{t('pharmPurchasing.min')}</th>
                      <th className="p-2 text-end">{t('pharmPurchasing.orderQty')}</th>
                      <th className="p-2 text-end">{t('pharmPurchasing.cost')}</th>
                      <th className="p-2 text-start">{t('pharmPurchasing.supplier')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const d = drafts[r.product_id];
                      if (!d) return null;
                      return (
                        <tr key={r.product_id} className={`border-b ${d.selected ? 'bg-primary/5' : ''}`}>
                          <td className="p-2">
                            <input type="checkbox" checked={d.selected} onChange={(e) => setDraft(r.product_id, { selected: e.target.checked })} />
                          </td>
                          <td className="p-2">
                            <div className="font-medium">{nm(r)}</div>
                            <div className="font-mono text-xs text-muted-foreground" dir="ltr">{r.code}</div>
                          </td>
                          <td className="p-2 text-end tabular-nums" dir="ltr">
                            <span className={Number(r.on_hand) <= 0 ? 'font-semibold text-destructive' : ''}>{Number(r.on_hand)}</span>
                          </td>
                          <td className="p-2 text-end tabular-nums text-muted-foreground" dir="ltr">{Number(r.min_stock)}</td>
                          <td className="p-2 text-end">
                            <Input type="number" min="1" value={d.qty}
                              onChange={(e) => setDraft(r.product_id, { qty: Number(e.target.value) })}
                              className="h-9 w-20 text-end" dir="ltr" />
                          </td>
                          <td className="p-2 text-end tabular-nums text-muted-foreground" dir="ltr">{r.last_cost != null ? money(r.last_cost) : '—'}</td>
                          <td className="p-2">
                            <select value={d.supplier_id} onChange={(e) => setDraft(r.product_id, { supplier_id: e.target.value })}
                              className="h-9 w-44 rounded-md border border-input bg-background px-2 text-sm">
                              <option value="">{t('pharmPurchasing.noSupplier')}</option>
                              {suppliers.map((s) => <option key={s.id} value={s.id}>{nm(s)}</option>)}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between gap-3 border-t p-3">
                <span className="text-sm text-muted-foreground">{selectedCount} / {rows.length}</span>
                <Button disabled={busy || selectedCount === 0} onClick={createPos}>
                  <ShoppingCart className="h-4 w-4" /> {t('pharmPurchasing.createPos')}
                </Button>
              </div>
            </>
          )}
        </CardContent></Card>
      )}

      {tab === 'orders' && (
        <Card><CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">…</div>
          ) : orders.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">{t('pharmPurchasing.emptyOrders')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start">{t('pharmPurchasing.poNumber')}</th>
                    <th className="p-3 text-start">{t('pharmPurchasing.supplier')}</th>
                    <th className="p-3 text-end">{t('pharmPurchasing.lines')}</th>
                    <th className="p-3 text-end">{t('pharmPurchasing.total')}</th>
                    <th className="p-3 text-start">{t('pharmPurchasing.status')}</th>
                    <th className="p-3 text-start">{t('pharmPurchasing.date')}</th>
                    <th className="p-3 text-end"></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b">
                      <td className="p-3 font-mono text-xs" dir="ltr">{o.po_number}</td>
                      <td className="p-3">{o.supplier_name ?? '—'}</td>
                      <td className="p-3 text-end tabular-nums" dir="ltr">{o.line_count}</td>
                      <td className="p-3 text-end tabular-nums" dir="ltr">{money(o.net_amount)}</td>
                      <td className="p-3"><Badge variant={statusVariant(o.status)}>{t(`pharmPurchasing.st.${o.status}`)}</Badge></td>
                      <td className="p-3 text-xs text-muted-foreground" dir="ltr">{formatDate(o.created_at, intlLocale)}</td>
                      <td className="p-3 text-end">
                        {(o.status === 'sent' || o.status === 'draft' || o.status === 'partial') && (
                          <Button size="sm" variant="secondary" disabled={receiving === o.id} onClick={() => receive(o.id)}>
                            <PackageCheck className="h-4 w-4" /> {t('pharmPurchasing.receive')}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent></Card>
      )}
    </div>
  );
}
