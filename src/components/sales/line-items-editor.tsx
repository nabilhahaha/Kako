'use client';

import { useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { computeLine, computeTotals, type LineInput } from '@/lib/erp/sales-calc';
import type { ProductCatalog } from '@/lib/erp/types';
import { Plus, Trash2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';

export interface EditorLine extends LineInput {
  key: string;
}

export function newLine(): EditorLine {
  return {
    key: Math.random().toString(36).slice(2),
    product_id: '',
    quantity: 1,
    unit_price: 0,
    discount_pct: 0,
    tax_rate: 0,
  };
}

export function LineItemsEditor({
  products,
  lines,
  onChange,
  priceField = 'sell',
  priceResolver,
}: {
  products: ProductCatalog[];
  lines: EditorLine[];
  onChange: (lines: EditorLine[]) => void;
  priceField?: 'sell' | 'cost';
  /** Optional Pricing-engine resolver. When provided (sales orders/invoices with
   *  a selected customer), the picked product's price is resolved through the
   *  engine; the user can still override it. Absent → base sell/cost price. */
  priceResolver?: (productId: string, qty: number) => Promise<number | null>;
}) {
  const { t, locale } = useI18n();
  const intl = INTL_LOCALE[locale];
  // Always-fresh handle on lines so an async resolver patch doesn't clobber the
  // synchronous product pick (stale-closure safety).
  const linesRef = useRef(lines);
  linesRef.current = lines;
  function update(key: string, patch: Partial<EditorLine>) {
    onChange(linesRef.current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function onPickProduct(key: string, productId: string) {
    const p = products.find((x) => x.id === productId);
    const basePrice = p ? Number(priceField === 'cost' ? p.cost_price : p.sell_price) : 0;
    const qty = lines.find((l) => l.key === key)?.quantity ?? 1;
    update(key, {
      product_id: productId,
      unit_price: basePrice,
      tax_rate: p ? Number(p.tax_rate) : 0,
    });
    if (productId && priceResolver) {
      priceResolver(productId, qty).then((resolved) => {
        if (resolved != null) update(key, { unit_price: resolved });
      });
    }
  }

  const totals = computeTotals(lines.filter((l) => l.product_id));

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-secondary/50 text-muted-foreground">
            <tr>
              <th className="p-2 text-start font-medium">{t('shared.lineItems.product')}</th>
              <th className="p-2 text-center font-medium w-20">{t('shared.lineItems.qty')}</th>
              <th className="p-2 text-center font-medium w-28">{t('shared.lineItems.unitPrice')}</th>
              <th className="p-2 text-center font-medium w-20">{t('shared.lineItems.discountPct')}</th>
              <th className="p-2 text-center font-medium w-14">{t('shared.lineItems.tax')}</th>
              <th className="p-2 text-end font-medium w-28">{t('shared.lineItems.lineTotal')}</th>
              <th className="p-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const c = computeLine(l);
              return (
                <tr key={l.key} className="border-b last:border-0">
                  <td className="p-2">
                    <select
                      value={l.product_id}
                      onChange={(e) => onPickProduct(l.key, e.target.value)}
                      className="h-9 w-full min-w-[10rem] rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="">{t('shared.lineItems.chooseProduct')}</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} · {p.name_ar || p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <Input
                      type="number" step="0.001" min="0" dir="ltr"
                      value={l.quantity}
                      onChange={(e) => update(l.key, { quantity: Number(e.target.value) })}
                      className="h-9 text-center"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number" step="0.01" min="0" dir="ltr"
                      value={l.unit_price}
                      onChange={(e) => update(l.key, { unit_price: Number(e.target.value) })}
                      className="h-9 text-center"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number" step="0.01" min="0" max="100" dir="ltr"
                      value={l.discount_pct}
                      onChange={(e) => update(l.key, { discount_pct: Number(e.target.value) })}
                      className="h-9 text-center"
                    />
                  </td>
                  <td className="p-2 text-center text-xs text-muted-foreground" dir="ltr">
                    {l.tax_rate}%
                  </td>
                  <td className="p-2 text-end tabular-nums" dir="ltr">
                    {formatCurrency(c.net + c.tax, 'EGP', intl)}
                  </td>
                  <td className="p-2">
                    <button
                      type="button"
                      onClick={() => onChange(lines.filter((x) => x.key !== l.key))}
                      className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                      aria-label={t('shared.lineItems.remove')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-muted-foreground">
                  {t('shared.lineItems.addAtLeastOne')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-start justify-between gap-4">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...lines, newLine()])}>
          <Plus className="h-4 w-4" /> {t('shared.lineItems.addLine')}
        </Button>
        <div className="w-64 space-y-1 text-sm">
          <Row label={t('shared.lineItems.total')} value={formatCurrency(totals.total_amount, 'EGP', intl)} />
          <Row label={t('shared.lineItems.discount')} value={`- ${formatCurrency(totals.discount_amount, 'EGP', intl)}`} />
          <Row label={t('shared.lineItems.taxTotal')} value={formatCurrency(totals.tax_amount, 'EGP', intl)} />
          <div className="flex justify-between border-t pt-1 font-bold">
            <span>{t('shared.lineItems.net')}</span>
            <span dir="ltr" className="tabular-nums">{formatCurrency(totals.net_amount, 'EGP', intl)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span dir="ltr" className="tabular-nums">{value}</span>
    </div>
  );
}
