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

/** Per-product sellable units (base + alternates) keyed by product id. */
export type ProductUnitsMap = Record<string, { uom: string; factor: number }[]>;

export interface EditorLine extends LineInput {
  key: string;
  /** Working UoM selection (null/'' = base). quantity/unit_price are in THIS unit;
   *  converted to base via editorLineToBase() at submit. */
  uom?: string | null;
}

export function newLine(): EditorLine {
  return {
    key: Math.random().toString(36).slice(2),
    product_id: '',
    quantity: 1,
    unit_price: 0,
    discount_pct: 0,
    tax_rate: 0,
    uom: null,
  };
}

/** Base units per a product's chosen UoM (1 for base/unset). */
export function unitFactor(units: ProductUnitsMap, productId: string, uom: string | null | undefined): number {
  return (uom ? units[productId]?.find((u) => u.uom === uom)?.factor : 1) || 1;
}

/**
 * Convert an editor line (entered in its chosen UoM) into the base LineInput the
 * server stores: quantity → BASE, unit_price → per-base, plus the
 * entered_uom/entered_qty/uom_factor snapshot (null when base). Use this in every
 * consumer's submit map so the base-unit invariant holds and UoM is captured.
 */
export function editorLineToBase(l: EditorLine, units: ProductUnitsMap): LineInput {
  const factor = unitFactor(units, l.product_id, l.uom);
  if (!l.uom || factor === 1) {
    return { product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price, discount_pct: l.discount_pct, tax_rate: l.tax_rate };
  }
  return {
    product_id: l.product_id,
    quantity: l.quantity * factor,
    unit_price: l.unit_price / factor,
    discount_pct: l.discount_pct,
    tax_rate: l.tax_rate,
    entered_uom: l.uom,
    entered_qty: l.quantity,
    uom_factor: factor,
  };
}

export function LineItemsEditor({
  products,
  lines,
  onChange,
  priceField = 'sell',
  priceResolver,
  productUnits = {},
  multiUom = false,
}: {
  products: ProductCatalog[];
  lines: EditorLine[];
  onChange: (lines: EditorLine[]) => void;
  priceField?: 'sell' | 'cost';
  /** Optional Pricing-engine resolver. When provided (sales orders/invoices with
   *  a selected customer), the picked product's price is resolved through the
   *  engine; the user can still override it. Absent → base sell/cost price. */
  priceResolver?: (productId: string, qty: number) => Promise<number | null>;
  /** U3: per-product sellable units for the per-line UoM selector. */
  productUnits?: ProductUnitsMap;
  multiUom?: boolean;
}) {
  const { t, locale } = useI18n();
  const intl = INTL_LOCALE[locale];
  // UoM is offered only for SELL documents (invoices / sales orders); purchasing
  // (cost) stays base until U4. A product shows a selector only when it has >1 unit.
  const uomEnabled = multiUom && priceField === 'sell';
  const unitsFor = (pid: string) => productUnits[pid] ?? [];
  // Always-fresh handle on lines so an async resolver patch doesn't clobber the
  // synchronous product pick (stale-closure safety).
  const linesRef = useRef(lines);
  linesRef.current = lines;
  function update(key: string, patch: Partial<EditorLine>) {
    onChange(linesRef.current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  function onPickProduct(key: string, productId: string) {
    const p = products.find((x) => x.id === productId);
    const basePrice = p ? Number(priceField === 'cost' ? p.cost_price : p.sell_price) : 0;
    const qty = lines.find((l) => l.key === key)?.quantity ?? 1;
    update(key, {
      product_id: productId,
      unit_price: basePrice,
      tax_rate: p ? Number(p.tax_rate) : 0,
      uom: null, // reset to base on product change
    });
    if (productId && priceResolver) {
      priceResolver(productId, qty).then((resolved) => {
        if (resolved != null) update(key, { unit_price: resolved });
      });
    }
  }

  // Selecting a UoM re-prices the line per the chosen unit (base price × factor),
  // re-resolving via the pricing engine on the BASE qty when a resolver is present.
  function onChangeUom(key: string, uom: string) {
    const l = linesRef.current.find((x) => x.key === key);
    if (!l) return;
    const p = products.find((x) => x.id === l.product_id);
    const base = p ? Number(priceField === 'cost' ? p.cost_price : p.sell_price) : 0;
    const factor = unitFactor(productUnits, l.product_id, uom || null);
    update(key, { uom: uom || null, unit_price: round2(base * factor) });
    if (l.product_id && priceResolver) {
      priceResolver(l.product_id, (Number(l.quantity) || 1) * factor).then((resolved) => {
        if (resolved != null) update(key, { unit_price: round2(resolved * factor) });
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
              {uomEnabled && <th className="p-2 text-center font-medium w-28">{t('shared.lineItems.unit')}</th>}
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
                  {uomEnabled && (
                    <td className="p-2">
                      {unitsFor(l.product_id).length > 1 ? (
                        <select
                          value={l.uom ?? ''}
                          onChange={(e) => onChangeUom(l.key, e.target.value)}
                          className="h-9 w-full min-w-[6.5rem] rounded-md border border-input bg-background px-2 text-sm"
                        >
                          {unitsFor(l.product_id).map((u) => (
                            <option key={u.uom} value={u.factor === 1 ? '' : u.uom}>
                              {u.factor === 1 ? u.uom : `${u.uom} (×${u.factor})`}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  )}
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
                <td colSpan={uomEnabled ? 8 : 7} className="p-4 text-center text-muted-foreground">
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
