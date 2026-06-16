import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Minus, Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ActionButton } from '@/components/salesman/ActionButton';
import { CustomerContextHeader } from '@/components/salesman/CustomerContextHeader';
import { cn, formatCurrency } from '@/lib/utils';
import { useSalesmanDay, useCustomerView, type SaleLineInput } from '@/stores/salesmanDayStore';
import { checkInvoice } from '@/lib/salesman/credit';
import { defaultUoM, getUoM } from '@/lib/salesman/uom';
import type { PaymentMethod, UoMCode } from '@/lib/salesman/types';

interface CartLine {
  uom: UoMCode;
  qty: number;
}

export function NewSalePage() {
  const { customerId = '' } = useParams();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const navigate = useNavigate();

  const view = useCustomerView(customerId);
  const products = useSalesmanDay((s) => s.products);
  const vanInventory = useSalesmanDay((s) => s.vanInventory);
  const route = useSalesmanDay((s) => s.route);
  const createSale = useSalesmanDay((s) => s.createSale);

  const productList = useMemo(
    () => Object.values(products).filter((p) => p.isActive),
    [products],
  );

  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [paidNow, setPaidNow] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>('cash');

  const stop = route.find((r) => r.customerId === customerId);

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const p of productList) {
      const line = cart[p.id];
      if (!line || line.qty <= 0) continue;
      const u = getUoM(p, line.uom);
      const net = (u?.price ?? 0) * line.qty;
      subtotal += net;
      tax += net * p.taxRate;
    }
    subtotal = Math.round(subtotal * 100) / 100;
    tax = Math.round(tax * 100) / 100;
    return { subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100 };
  }, [cart, productList]);

  if (!view || !stop) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{t('common.noData')}</p>;
  }

  const creditInput = { ...view.credit, ...view.balance };
  const hasItems = totals.total > 0;
  const check = checkInvoice(creditInput, totals.total, paidNow);
  const canConfirm = hasItems && check.ok;

  const setQty = (productId: string, uom: UoMCode, qty: number) =>
    setCart((c) => ({ ...c, [productId]: { uom, qty: Math.max(0, qty) } }));

  const confirm = async () => {
    const lines: SaleLineInput[] = Object.entries(cart)
      .filter(([, l]) => l.qty > 0)
      .map(([productId, l]) => ({ productId, uom: l.uom, qty: l.qty }));
    if (lines.length === 0) return;
    const invoice = createSale(customerId, lines, paidNow, method);
    await new Promise((r) => setTimeout(r, 200));
    // Replace so the salesman cannot navigate back into the sale form for
    // the same customer — the flow moves forward to the confirmation screen.
    navigate(`/salesman/invoice/${invoice.id}`, { replace: true });
  };

  return (
    <div className="space-y-4 pb-40">
      <CustomerContextHeader view={view} visitStatus={stop.status} />

      <h2 className="text-sm font-semibold text-muted-foreground">{t('salesman.addProducts')}</h2>

      <ul className="space-y-2">
        {productList.map((p) => {
          const line = cart[p.id] ?? { uom: defaultUoM(p).code, qty: 0 };
          const u = getUoM(p, line.uom);
          const onVan = vanInventory[p.id]?.qtyBase ?? 0;
          const name = isAr ? p.nameAr : p.name;
          return (
            <Card key={p.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground" title={name}>{name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {p.code} · {formatCurrency(u?.price ?? 0)}
                    {u ? ` / ${isAr ? u.nameAr : u.name}` : ''}
                  </p>
                </div>
                <select
                  value={line.uom}
                  onChange={(e) => setQty(p.id, e.target.value as UoMCode, line.qty)}
                  className="h-8 shrink-0 rounded-md border border-input bg-background px-2 text-xs"
                >
                  {p.uoms.map((uom) => (
                    <option key={uom.code} value={uom.code}>
                      {isAr ? uom.nameAr : uom.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  {t('salesman.vanStock')}: <span className="tabular-nums">{onVan}</span>
                </span>
                <div className="flex items-center gap-2">
                  <Stepper
                    onDec={() => setQty(p.id, line.uom, line.qty - 1)}
                    onInc={() => setQty(p.id, line.uom, line.qty + 1)}
                    value={line.qty}
                    onChange={(v) => setQty(p.id, line.uom, v)}
                  />
                </div>
              </div>
            </Card>
          );
        })}
      </ul>

      {/* Sticky totals + payment + confirm */}
      <div
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}
      >
        <div className="mx-auto w-full max-w-screen-sm space-y-2 px-4 pt-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t('salesman.subtotal')}: <span className="tabular-nums">{formatCurrency(totals.subtotal)}</span></span>
            <span>{t('salesman.vat')}: <span className="tabular-nums">{formatCurrency(totals.tax)}</span></span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-1 rounded-lg border border-input bg-background px-2">
              <span className="text-[11px] text-muted-foreground">{t('salesman.paidNow')}</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={paidNow || ''}
                onChange={(e) => setPaidNow(Math.max(0, Number(e.target.value) || 0))}
                className="h-9 w-full bg-transparent text-end text-sm tabular-nums outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => setPaidNow(totals.total)}
              className="h-9 shrink-0 rounded-lg border border-input px-2 text-xs font-medium active:scale-95"
            >
              {t('salesman.payFull')}
            </button>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="h-9 shrink-0 rounded-lg border border-input bg-background px-2 text-xs"
            >
              <option value="cash">{t('salesman.method_cash')}</option>
              <option value="cheque">{t('salesman.method_cheque')}</option>
              <option value="transfer">{t('salesman.method_transfer')}</option>
            </select>
          </div>

          {hasItems && !check.ok && (
            <p className="rounded-md bg-destructive/10 px-2 py-1 text-[11px] font-medium text-destructive">
              {t(`salesman.err_${check.error}`)}
            </p>
          )}

          <ActionButton
            size="lg"
            className="h-13 min-h-12 w-full text-base"
            disabled={!canConfirm}
            loadingText={t('common.loading')}
            onClick={confirm}
          >
            {t('salesman.confirmSale')} · {formatCurrency(totals.total)}
          </ActionButton>
        </div>
      </div>

      {!hasItems && (
        <p className="text-center text-xs text-muted-foreground">{t('salesman.emptyCart')}</p>
      )}
    </div>
  );
}

function Stepper({
  value,
  onInc,
  onDec,
  onChange,
}: {
  value: number;
  onInc: () => void;
  onDec: () => void;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onDec}
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-lg border border-input active:scale-95',
          value === 0 && 'opacity-40',
        )}
      >
        <Minus className="h-4 w-4" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={value || ''}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="h-9 w-12 rounded-lg border border-input bg-background text-center text-sm tabular-nums outline-none"
      />
      <button
        type="button"
        onClick={onInc}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-input bg-primary/5 text-primary active:scale-95"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
