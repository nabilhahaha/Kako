'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { computeLine, computeTotals, type LineInput } from '@/lib/erp/sales-calc';
import type { ProductCatalog } from '@/lib/erp/types';
import { Plus, Trash2 } from 'lucide-react';

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
}: {
  products: ProductCatalog[];
  lines: EditorLine[];
  onChange: (lines: EditorLine[]) => void;
}) {
  function update(key: string, patch: Partial<EditorLine>) {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function onPickProduct(key: string, productId: string) {
    const p = products.find((x) => x.id === productId);
    update(key, {
      product_id: productId,
      unit_price: p ? Number(p.sell_price) : 0,
      tax_rate: p ? Number(p.tax_rate) : 0,
    });
  }

  const totals = computeTotals(lines.filter((l) => l.product_id));

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-secondary/50 text-muted-foreground">
            <tr>
              <th className="p-2 text-right font-medium">المنتج</th>
              <th className="p-2 text-center font-medium w-20">الكمية</th>
              <th className="p-2 text-center font-medium w-28">سعر الوحدة</th>
              <th className="p-2 text-center font-medium w-20">خصم %</th>
              <th className="p-2 text-center font-medium w-14">ضريبة</th>
              <th className="p-2 text-left font-medium w-28">الإجمالي</th>
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
                      <option value="">اختر منتجاً…</option>
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
                  <td className="p-2 text-left tabular-nums" dir="ltr">
                    {formatCurrency(c.net + c.tax)}
                  </td>
                  <td className="p-2">
                    <button
                      type="button"
                      onClick={() => onChange(lines.filter((x) => x.key !== l.key))}
                      className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                      aria-label="حذف"
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
                  أضف بنداً واحداً على الأقل.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-start justify-between gap-4">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...lines, newLine()])}>
          <Plus className="h-4 w-4" /> إضافة بند
        </Button>
        <div className="w-64 space-y-1 text-sm">
          <Row label="الإجمالي" value={formatCurrency(totals.total_amount)} />
          <Row label="الخصم" value={`- ${formatCurrency(totals.discount_amount)}`} />
          <Row label="الضريبة" value={formatCurrency(totals.tax_amount)} />
          <div className="flex justify-between border-t pt-1 font-bold">
            <span>الصافي</span>
            <span dir="ltr" className="tabular-nums">{formatCurrency(totals.net_amount)}</span>
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
