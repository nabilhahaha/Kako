'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Loader2, Plus, Minus, X, Trash2, StickyNote, UtensilsCrossed, ShoppingBag, Bike,
  Delete, RefreshCw, Image as ImageIcon, CheckCircle2, Maximize2, WifiOff,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';
import { ScanButton, type ScanResult } from '@/components/scanning/scanner';
import { usePosDevices } from './devices/use-pos-devices';
import { usePosOnline, toggleFullscreen } from './devices/use-pos-online';
import { localStorageStore, memoryStore } from './offline/offline-store';
import { useOfflineSync } from './offline/use-offline-sync';
import { newOfflineSale, tempNumber, type OfflineSalePayload } from './offline/offline-queue';
import { printOfflineReceipt } from './offline/offline-receipt';
import {
  getPosBootstrap, posCheckout, type PosProduct, type PosCategory, type PosTable,
} from './pos-actions';
import {
  addToCart, incQty, decQty, removeLine, setLineNote, cartTotals, changeDue, balanceDue,
  quickCashOptions, DEFAULT_CHARGES, type CartLine, type CartCharges, type OrderMode,
} from './pos-cart';

const MODE_ICON = { dine_in: UtensilsCrossed, takeaway: ShoppingBag, delivery: Bike } as const;

export function PosTerminal({ companyId }: { companyId: string }) {
  const { t, locale } = useI18n();
  const devices = usePosDevices();
  const online = usePosOnline();
  const store = useMemo(() => (typeof window !== 'undefined' && companyId ? localStorageStore(companyId) : memoryStore()), [companyId]);
  const sync = useOfflineSync(store, online);
  const ar = locale === 'ar';
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [categories, setCategories] = useState<PosCategory[]>([]);
  const [tables, setTables] = useState<PosTable[]>([]);
  const [cat, setCat] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [charges] = useState<CartCharges>(DEFAULT_CHARGES);
  const [mode, setMode] = useState<OrderMode>('takeaway');
  const [tableId, setTableId] = useState<string>('');
  const [orderNote, setOrderNote] = useState('');
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pickList, setPickList] = useState<PosProduct[] | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const pname = useCallback((p: { name: string; nameAr: string | null }) => (ar && p.nameAr) || p.name, [ar]);

  const load = useCallback(async () => {
    setLoading(true);
    // Wrap the server call so an offline reload (network throw) falls back to the cached menu
    // instead of breaking the screen — the cashier keeps selling against cached catalog.
    let ok = false;
    try {
      const res = await getPosBootstrap();
      if (res.ok) {
        setProducts(res.data.products); setCategories(res.data.categories); setTables(res.data.tables);
        store.cacheMenu(res.data);   // refresh the offline menu cache while online
        ok = true;
      }
    } catch { /* offline / network error → use cache below */ }
    if (!ok) {
      const cached = store.getMenu<{ products: PosProduct[]; categories: PosCategory[]; tables: PosTable[] }>();
      if (cached) { setProducts(cached.products); setCategories(cached.categories); setTables(cached.tables); }
    }
    setLoading(false);
  }, [store]);
  useEffect(() => { void load(); }, [load]);

  function flash(msg: string) { setToast(msg); window.setTimeout(() => setToast(null), 1600); }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) =>
      (!cat || p.categoryId === cat) &&
      (!q || p.name.toLowerCase().includes(q) || (p.nameAr ?? '').includes(query.trim()) || (p.code ?? '').toLowerCase().includes(q) || (p.barcode ?? '').includes(q)),
    );
  }, [products, cat, query]);

  const totals = useMemo(() => cartTotals(lines, charges), [lines, charges]);
  const prodById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const catName = useMemo(() => new Map(categories.map((c) => [c.id, (ar && c.nameAr) || c.name])), [categories, ar]);

  function add(p: PosProduct) {
    setLines((prev) => addToCart(prev, { productId: p.id, name: pname(p), price: p.price, taxRate: p.taxRate }));
  }

  // Scan: exact barcode → add (+qty on repeat); multiple → chooser; none → toast.
  function onScan(r: ScanResult) {
    const code = r.value.trim();
    if (!code) return;
    const matches = products.filter((p) => (p.barcode ?? '') === code || (p.code ?? '') === code);
    if (matches.length === 1) {
      const existed = lines.some((l) => l.productId === matches[0].id);
      add(matches[0]);
      flash(existed ? t('foodPos.scanQtyUp') : t('foodPos.scanAdded'));
    } else if (matches.length > 1) {
      setPickList(matches);
    } else {
      flash(t('foodPos.notFound', { code }));
    }
  }

  async function onPaid(invoiceId: string, orderId: string, method: 'cash' | 'card' | 'mixed') {
    setPayOpen(false);
    setLines([]); setOrderNote(''); setTableId('');
    // Print via the device PROVIDER (browser print now; ESC/POS/bridge later) — keeps the
    // cashier on the POS. Open the cash drawer on cash sales when the device supports it.
    void devices.printer.print({ kind: 'receipt', invoiceId, orderId, openDrawer: method === 'cash' });
    if (method === 'cash' && devices.cashDrawer.canOpen) void devices.cashDrawer.open();
  }

  if (loading) return <div className="flex h-[60vh] items-center justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {!online && (
        <div className="flex items-center justify-center gap-2 bg-red-600 px-3 py-1.5 text-center text-sm font-medium text-white">
          <WifiOff className="h-4 w-4 shrink-0" /> {t('foodPos.offline')}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {/* ── Menu side ── */}
      <div className="flex min-w-0 flex-1 flex-col border-e">
        <div className="flex items-center gap-2 border-b p-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={t('foodPos.search')}
              className="h-10 w-full rounded-xl border bg-background ps-9 pe-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <ScanButton onScan={onScan} label={t('foodPos.scan')} className="h-10 shrink-0 rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground" />
          {(sync.counts.pending + sync.counts.failed) > 0 && (
            <button onClick={() => void sync.drain()} title={t('foodPos.pendingSync')}
              className="grid h-10 shrink-0 place-items-center rounded-xl border border-amber-300 bg-amber-50 px-2.5 text-xs font-bold text-amber-700">
              {sync.counts.pending + sync.counts.failed} ⏳
            </button>
          )}
          <button onClick={() => void toggleFullscreen()} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border" aria-label={t('foodPos.fullscreen')}>
            <Maximize2 className="h-4 w-4" />
          </button>
          <button onClick={() => void load()} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border" aria-label={t('foodPos.refresh')}>
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1.5 overflow-x-auto border-b p-2">
          <CatTab active={cat === null} onClick={() => setCat(null)}>{t('foodPos.allCategories')}</CatTab>
          {categories.map((c) => (
            <CatTab key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>{(ar && c.nameAr) || c.name}</CatTab>
          ))}
        </div>

        {/* Product grid */}
        <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2.5 overflow-y-auto p-3 sm:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <button key={p.id} onClick={() => add(p)}
              className="group flex flex-col overflow-hidden rounded-2xl border bg-card text-start shadow-sm transition active:scale-[0.98] hover:border-primary/50">
              <div className="relative aspect-square w-full overflow-hidden bg-secondary">
                {p.imageUrl
                  ? <img src={p.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                  : <div className="grid h-full w-full place-items-center text-muted-foreground"><ImageIcon className="h-7 w-7 opacity-40" /></div>}
              </div>
              <div className="flex flex-1 flex-col gap-0.5 p-2">
                <span className="line-clamp-2 text-sm font-medium leading-tight">{pname(p)}</span>
                {p.categoryId && catName.get(p.categoryId) && <span className="truncate text-[10px] text-muted-foreground">{catName.get(p.categoryId)}</span>}
                <span className="mt-auto font-bold text-primary">{p.price.toFixed(2)}</span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && <div className="col-span-full py-16 text-center text-sm text-muted-foreground">{t('foodPos.cartEmpty')}</div>}
        </div>
      </div>

      {/* ── Order side (always visible on lg) ── */}
      <div className="flex w-full flex-col bg-card lg:w-[380px]">
        {/* Order mode */}
        <div className="grid grid-cols-3 gap-1 p-2">
          {(['dine_in', 'takeaway', 'delivery'] as const).map((m) => {
            const Icon = MODE_ICON[m];
            return (
              <button key={m} onClick={() => setMode(m)}
                className={cn('flex flex-col items-center gap-1 rounded-xl border py-2 text-xs font-medium',
                  mode === m ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground')}>
                <Icon className="h-4 w-4" /> {t(`foodPos.${m === 'dine_in' ? 'dineIn' : m}`)}
              </button>
            );
          })}
        </div>
        {mode === 'dine_in' && tables.length > 0 && (
          <div className="px-2 pb-2">
            <select value={tableId} onChange={(e) => setTableId(e.target.value)} className="h-9 w-full rounded-lg border bg-background px-2 text-sm">
              <option value="">{t('foodPos.selectTable')}</option>
              {tables.map((tb) => <option key={tb.id} value={tb.id}>{tb.name}</option>)}
            </select>
          </div>
        )}

        {/* Lines */}
        <div className="min-h-0 flex-1 overflow-y-auto border-y">
          {lines.length === 0 ? (
            <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">{t('foodPos.cartEmpty')}</div>
          ) : (
            <ul className="divide-y">
              {lines.map((l) => (
                <li key={l.productId} className="p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-secondary">
                      {prodById.get(l.productId)?.imageUrl
                        ? <img src={prodById.get(l.productId)!.imageUrl!} alt="" loading="lazy" className="h-full w-full object-cover" />
                        : <span className="grid h-full w-full place-items-center text-muted-foreground"><ImageIcon className="h-4 w-4 opacity-40" /></span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{l.name}</span>
                      <span className="text-xs text-muted-foreground">{l.price.toFixed(2)} × {l.qty} = <b>{(l.price * l.qty).toFixed(2)}</b></span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setLines(decQty(lines, l.productId))} className="grid h-7 w-7 place-items-center rounded-lg border"><Minus className="h-3.5 w-3.5" /></button>
                      <span className="w-6 text-center text-sm font-bold tabular-nums">{l.qty}</span>
                      <button onClick={() => setLines(incQty(lines, l.productId))} className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-primary-foreground"><Plus className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setNoteFor(noteFor === l.productId ? null : l.productId)} className={cn('grid h-7 w-7 place-items-center rounded-lg border', l.note && 'border-primary text-primary')}><StickyNote className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setLines(removeLine(lines, l.productId))} className="grid h-7 w-7 place-items-center rounded-lg border text-destructive"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                  {noteFor === l.productId && (
                    <input autoFocus defaultValue={l.note ?? ''} onBlur={(e) => { setLines(setLineNote(lines, l.productId, e.target.value)); setNoteFor(null); }}
                      placeholder={t('foodPos.notePlaceholder')} className="mt-1.5 h-8 w-full rounded-lg border bg-background px-2 text-xs" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Totals + actions */}
        <div className="space-y-1.5 p-3">
          <Row label={t('foodPos.subtotal')} val={totals.subtotal} />
          {totals.discount > 0 && <Row label={t('foodPos.discount')} val={-totals.discount} />}
          {totals.service > 0 && <Row label={t('foodPos.service')} val={totals.service} />}
          {totals.tax > 0 && <Row label={t('foodPos.tax')} val={totals.tax} />}
          <div className="flex items-center justify-between border-t pt-1.5 text-base font-bold">
            <span>{t('foodPos.total')}</span><span className="text-primary">{totals.total.toFixed(2)}</span>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => { if (lines.length && confirm(t('foodPos.clearConfirm'))) { setLines([]); setOrderNote(''); } }}
              disabled={lines.length === 0} className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border text-destructive disabled:opacity-40"><Trash2 className="h-5 w-5" /></button>
            <button onClick={() => setPayOpen(true)} disabled={lines.length === 0}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-40">
              {t('foodPos.pay')} · {totals.total.toFixed(2)}
            </button>
          </div>
        </div>
      </div>
      </div>

      {/* Toast */}
      {toast && <div className="fixed bottom-6 start-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-sm text-background shadow-lg rtl:translate-x-1/2">{toast}</div>}

      {/* Multi-match chooser */}
      {pickList && (
        <Sheet onClose={() => setPickList(null)} title={t('foodPos.multiMatch')}>
          <ul className="divide-y">
            {pickList.map((p) => (
              <li key={p.id}><button onClick={() => { add(p); setPickList(null); }} className="flex w-full items-center justify-between p-3 text-start hover:bg-secondary">
                <span>{pname(p)}</span><span className="font-bold text-primary">{p.price.toFixed(2)}</span></button></li>
            ))}
          </ul>
        </Sheet>
      )}

      {/* Payment */}
      {payOpen && (
        <PaymentPanel
          total={totals.total}
          onClose={() => setPayOpen(false)}
          onConfirm={async (method) => {
            const items = lines.map((l) => ({ productId: l.productId, name: l.name, price: l.price, qty: l.qty, note: l.note }));
            if (online) {
              const res = await posCheckout({
                mode, tableId: tableId || null, orderNote,
                discountType: charges.discountType, discountValue: charges.discountValue,
                serviceRate: charges.serviceRate, taxRate: charges.taxRate, deliveryFee: charges.deliveryFee,
                paymentMethod: method, items, clientUuid: crypto.randomUUID(),
              });
              if (res.ok && res.data) { void onPaid(res.data.invoiceId, res.data.orderId, method); return true; }
              flash(t('foodPos.errPayment'));
              return false;
            }
            // OFFLINE: queue the sale locally (frozen prices + a local temp number) and print a
            // local "PENDING SYNC" receipt. It syncs to an official ZATCA invoice when online.
            const temp = tempNumber(Date.now());
            const sale: OfflineSalePayload = {
              mode, tableId: tableId || null, customerName: null, customerPhone: null, customerAddress: null,
              deliveryFee: charges.deliveryFee, discountType: charges.discountType, discountValue: charges.discountValue,
              serviceRate: charges.serviceRate, taxRate: charges.taxRate, orderNote: orderNote || null,
              paymentMethod: method, items, capturedTotal: totals.total,
            };
            store.put(newOfflineSale({ localUuid: crypto.randomUUID(), tempNumber: temp, companyId, cashier: null, createdAt: new Date().toISOString(), sale }));
            sync.refresh();
            printOfflineReceipt({ tempNumber: temp, outlet: '', lines, total: totals.total, labels: { pending: t('foodPos.pendingSync'), total: t('foodPos.total'), temp: t('foodPos.tempNo') } });
            setPayOpen(false); setLines([]); setOrderNote(''); setTableId('');
            return true;
          }}
        />
      )}
    </div>
  );
}

function Row({ label, val }: { label: string; val: number }) {
  return <div className="flex items-center justify-between text-sm text-muted-foreground"><span>{label}</span><span className="tabular-nums">{val.toFixed(2)}</span></div>;
}
function CatTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={cn('shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium', active ? 'bg-primary text-primary-foreground' : 'border bg-card')}>{children}</button>;
}
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-card p-1 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-3"><h3 className="font-semibold">{title}</h3><button onClick={onClose}><X className="h-5 w-5" /></button></div>
        {children}
      </div>
    </div>
  );
}

// ── Payment panel: method + quick cash + keypad + change ──
function PaymentPanel({ total, onClose, onConfirm }: { total: number; onClose: () => void; onConfirm: (m: 'cash' | 'card' | 'mixed') => Promise<boolean> }) {
  const { t } = useI18n();
  const [method, setMethod] = useState<'cash' | 'card' | 'mixed'>('cash');
  const [tendered, setTendered] = useState('');
  const [cardPart, setCardPart] = useState('');
  const [busy, setBusy] = useState(false);
  const tn = Number(tendered) || 0;
  const card = Number(cardPart) || 0;
  const change = changeDue(total, method === 'mixed' ? tn + card : tn);
  const due = method === 'mixed' ? balanceDue(total, tn + card) : balanceDue(total, tn);
  const press = (k: string) => setTendered((v) => k === 'del' ? v.slice(0, -1) : (v + k));

  return (
    <Sheet title={t('foodPos.pay')} onClose={onClose}>
      <div className="space-y-3 p-3">
        <div className="grid grid-cols-3 gap-1.5">
          {(['cash', 'card', 'mixed'] as const).map((m) => (
            <button key={m} onClick={() => setMethod(m)} className={cn('rounded-xl border py-2.5 text-sm font-semibold', method === m ? 'border-primary bg-primary/10 text-primary' : '')}>{t(`foodPos.${m}`)}</button>
          ))}
        </div>
        <div className="rounded-xl bg-secondary p-3 text-center">
          <div className="text-xs text-muted-foreground">{t('foodPos.total')}</div>
          <div className="text-2xl font-extrabold text-primary">{total.toFixed(2)}</div>
        </div>

        {method !== 'card' && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {quickCashOptions(total).map((q) => (
                <button key={q} onClick={() => setTendered(String(q))} className="rounded-lg border px-3 py-1.5 text-sm font-medium">{q.toFixed(0)}</button>
              ))}
              <button onClick={() => setTendered(total.toFixed(2))} className="rounded-lg border px-3 py-1.5 text-sm">{t('foodPos.exact')}</button>
            </div>
            <input value={tendered} onChange={(e) => setTendered(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal"
              placeholder={t('foodPos.tendered')} className="h-12 w-full rounded-xl border bg-background px-3 text-center text-xl font-bold" />
            {method === 'mixed' && (
              <input value={cardPart} onChange={(e) => setCardPart(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal"
                placeholder={t('foodPos.cardPart')} className="h-10 w-full rounded-xl border bg-background px-3 text-center" />
            )}
            <div className="grid grid-cols-3 gap-1.5">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map((k) => (
                <button key={k} onClick={() => press(k)} className="grid h-12 place-items-center rounded-xl border text-lg font-semibold active:bg-secondary">
                  {k === 'del' ? <Delete className="h-5 w-5" /> : k}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between rounded-xl bg-secondary px-3 py-2 text-sm">
              <span className="text-muted-foreground">{change > 0 ? t('foodPos.change') : t('foodPos.balanceDue')}</span>
              <span className={cn('text-lg font-bold', change > 0 ? 'text-emerald-600' : 'text-foreground')}>{(change > 0 ? change : due).toFixed(2)}</span>
            </div>
          </>
        )}

        <button disabled={busy} onClick={async () => { setBusy(true); const ok = await onConfirm(method); if (!ok) setBusy(false); }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-base font-bold text-primary-foreground disabled:opacity-50">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />} {busy ? t('foodPos.completing') : t('foodPos.complete')}
        </button>
      </div>
    </Sheet>
  );
}
