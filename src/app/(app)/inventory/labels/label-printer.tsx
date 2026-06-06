'use client';

import { useMemo, useState } from 'react';
import { Barcode39 } from '@/components/fashion/barcode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n/provider';
import { formatCurrency } from '@/lib/utils';
import { Printer, Search, Plus, Minus } from 'lucide-react';

export interface LabelProduct {
  id: string;
  code: string;
  name: string;
  name_ar: string | null;
  barcode: string | null;
  sell_price: number;
  size: string | null;
  color: string | null;
}

export function LabelPrinter({ products }: { products: LabelProduct[] }) {
  const { t, locale } = useI18n();
  const pick = (en: string, ar: string | null) => (locale === 'ar' ? ar || en : en);

  const [search, setSearch] = useState('');
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [source, setSource] = useState<'barcode' | 'sku'>('barcode');
  const [showPrice, setShowPrice] = useState(true);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 200);
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || (p.name_ar ?? '').includes(q) || p.code.toLowerCase().includes(q) || (p.barcode ?? '').toLowerCase().includes(q))
      .slice(0, 200);
  }, [products, search]);

  const setQty = (id: string, n: number) => setCopies((c) => ({ ...c, [id]: Math.max(0, n) }));

  const labels = useMemo(() => {
    const out: { p: LabelProduct; key: string }[] = [];
    for (const p of products) {
      const n = copies[p.id] ?? 0;
      for (let i = 0; i < n; i++) out.push({ p, key: `${p.id}-${i}` });
    }
    return out;
  }, [products, copies]);

  const totalLabels = labels.length;

  return (
    <div>
      {/* Controls — hidden when printing */}
      <div className="print:hidden space-y-4">
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('ops.lblSearch')} className="ps-8" />
            </div>
            <label className="flex items-center gap-1.5 text-sm">
              <span className="text-muted-foreground">{t('ops.lblSource')}</span>
              <select value={source} onChange={(e) => setSource(e.target.value as 'barcode' | 'sku')} className="h-9 rounded-md border bg-background px-2">
                <option value="barcode">{t('ops.lblSourceBarcode')}</option>
                <option value="sku">{t('ops.lblSourceSku')}</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} />
              {t('ops.lblShowPrice')}
            </label>
            <Button onClick={() => window.print()} disabled={totalLabels === 0} className="gap-1.5">
              <Printer className="h-4 w-4" /> {t('ops.lblPrint')} {totalLabels > 0 ? `(${totalLabels})` : ''}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="max-h-[28rem] overflow-y-auto divide-y">
              {filtered.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">{t('ops.lblNoProducts')}</p>
              ) : filtered.map((p) => {
                const n = copies[p.id] ?? 0;
                return (
                  <div key={p.id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{pick(p.name, p.name_ar)}</p>
                      <p className="font-mono text-xs text-muted-foreground" dir="ltr">
                        {p.code}{p.barcode ? ` · ${p.barcode}` : ''}{p.size ? ` · ${p.size}` : ''}{p.color ? ` · ${p.color}` : ''}
                      </p>
                    </div>
                    <span className="text-sm tabular-nums text-muted-foreground" dir="ltr">{formatCurrency(p.sell_price)}</span>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => setQty(p.id, n - 1)}><Minus className="h-3.5 w-3.5" /></Button>
                      <Input type="number" min="0" dir="ltr" value={n} onChange={(e) => setQty(p.id, Number(e.target.value))} className="h-8 w-16 text-center" />
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => setQty(p.id, n + 1)}><Plus className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Printable label sheet — thermal-friendly fixed-size labels */}
      <div className="mt-4 flex flex-wrap gap-2 print:mt-0 print:gap-0">
        {labels.map(({ p, key }) => {
          const value = (source === 'sku' ? p.code : (p.barcode || p.code)) || p.code;
          return (
            <div
              key={key}
              className="flex flex-col items-center justify-center rounded border border-black/70 bg-white p-1 text-black print:rounded-none"
              style={{ width: '40mm', height: '30mm' }}
            >
              <div className="w-full truncate text-center text-[9px] font-semibold leading-tight">{pick(p.name, p.name_ar)}</div>
              {(p.size || p.color) && (
                <div className="text-[8px] leading-tight text-black/70" dir="ltr">{[p.size, p.color].filter(Boolean).join(' · ')}</div>
              )}
              <Barcode39 value={value} height={26} module={1.4} className="my-0.5 block" />
              <div className="flex w-full items-center justify-between px-1 text-[8px]" dir="ltr">
                <span className="font-mono">{p.code}</span>
                {showPrice && <span className="font-bold">{formatCurrency(p.sell_price)}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
