import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Minus, Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ActionButton } from '@/components/salesman/ActionButton';
import { CustomerContextHeader } from '@/components/salesman/CustomerContextHeader';
import { formatCurrency } from '@/lib/utils';
import { useSalesmanDay, useCustomerView, type SaleLineInput } from '@/stores/salesmanDayStore';
import { defaultUoM, getUoM } from '@/lib/salesman/uom';
import type { UoMCode } from '@/lib/salesman/types';

export function ReturnPage() {
  const { customerId = '' } = useParams();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const navigate = useNavigate();

  const view = useCustomerView(customerId);
  const products = useSalesmanDay((s) => s.products);
  const route = useSalesmanDay((s) => s.route);
  const createReturn = useSalesmanDay((s) => s.createReturn);

  const productList = useMemo(() => Object.values(products).filter((p) => p.isActive), [products]);
  const [cart, setCart] = useState<Record<string, { uom: UoMCode; qty: number }>>({});

  const stop = route.find((r) => r.customerId === customerId);

  const total = useMemo(() => {
    let net = 0;
    for (const p of productList) {
      const l = cart[p.id];
      if (!l || l.qty <= 0) continue;
      const u = getUoM(p, l.uom);
      const n = (u?.price ?? 0) * l.qty;
      net += n + n * p.taxRate;
    }
    return Math.round(net * 100) / 100;
  }, [cart, productList]);

  if (!view || !stop) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{t('common.noData')}</p>;
  }

  const setQty = (id: string, uom: UoMCode, qty: number) =>
    setCart((c) => ({ ...c, [id]: { uom, qty: Math.max(0, qty) } }));

  const confirm = async () => {
    const lines: SaleLineInput[] = Object.entries(cart)
      .filter(([, l]) => l.qty > 0)
      .map(([productId, l]) => ({ productId, uom: l.uom, qty: l.qty }));
    if (lines.length === 0) return;
    const invoice = createReturn(customerId, lines);
    await new Promise((r) => setTimeout(r, 200));
    navigate(`/salesman/invoice/${invoice.id}`, { replace: true });
  };

  return (
    <div className="space-y-4 pb-28">
      <CustomerContextHeader view={view} visitStatus={stop.status} />
      <h2 className="text-sm font-semibold text-muted-foreground">{t('salesman.returns')}</h2>

      <ul className="space-y-2">
        {productList.map((p) => {
          const line = cart[p.id] ?? { uom: defaultUoM(p).code, qty: 0 };
          const u = getUoM(p, line.uom);
          const name = isAr ? p.nameAr : p.name;
          return (
            <Card key={p.id} className="flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold" title={name}>{name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{formatCurrency(u?.price ?? 0)}</p>
              </div>
              <select
                value={line.uom}
                onChange={(e) => setQty(p.id, e.target.value as UoMCode, line.qty)}
                className="h-8 shrink-0 rounded-md border border-input bg-background px-1.5 text-xs"
              >
                {p.uoms.map((uom) => (
                  <option key={uom.code} value={uom.code}>{isAr ? uom.nameAr : uom.name}</option>
                ))}
              </select>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => setQty(p.id, line.uom, line.qty - 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-input active:scale-95"><Minus className="h-4 w-4" /></button>
                <span className="w-7 text-center text-sm font-semibold tabular-nums">{line.qty}</span>
                <button type="button" onClick={() => setQty(p.id, line.uom, line.qty + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-input bg-primary/5 text-primary active:scale-95"><Plus className="h-4 w-4" /></button>
              </div>
            </Card>
          );
        })}
      </ul>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 px-4 pt-3 backdrop-blur" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}>
        <div className="mx-auto w-full max-w-screen-sm">
          <ActionButton size="lg" className="h-13 min-h-12 w-full text-base" variant="destructive" disabled={total <= 0} loadingText={t('common.loading')} onClick={confirm}>
            {t('salesman.return')} · {formatCurrency(total)}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
