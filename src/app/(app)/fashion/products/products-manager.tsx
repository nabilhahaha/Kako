'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createStyle, createVariant, upsertFashionLookup } from '../actions';
import { recordMutation, formPayload } from '@/lib/sync/web/write-seam';
import { Plus, Shirt, Tag } from 'lucide-react';

interface Opt { id: string; name: string; name_ar?: string | null; code?: string }
interface Style { id: string; name: string; code: string | null; gender: string | null }
interface Variant {
  id: string; style_id: string; size_id: string | null; color_id: string | null; installment_price: number;
  product: { code: string; barcode: string | null; sell_price: number; cost_price: number; min_stock: number; is_active: boolean } | null;
}

export function ProductsManager(props: {
  styles: Style[]; variants: Variant[]; sizes: Opt[]; colors: Opt[];
  seasons: Opt[]; brands: Opt[]; categories: Opt[]; suppliers: Opt[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [openStyle, setOpenStyle] = useState<string | null>(null);

  const submit = (
    fn: (fd: FormData) => Promise<{ ok: boolean; error?: string; data?: unknown }>,
    form: HTMLFormElement,
    record?: (fd: FormData, data: unknown) => void,
  ) =>
    start(async () => {
      const fd = new FormData(form);
      const res = await fn(fd);
      if (res.ok) { record?.(fd, res.data); toast.success(t('fashion.products.saved')); form.reset(); router.refresh(); }
      else toast.error(res.error || 'Error');
    });

  // products = LWW. The new product/style id is the sync pk. No-op unless KAKO_SYNC.
  const recordProduct = (fd: FormData, pk: string | undefined) => {
    if (pk) void recordMutation({ entity: 'products', op: 'insert', pk, payload: formPayload(fd) });
  };

  const sizeName = (id: string | null) => props.sizes.find((s) => s.id === id)?.name ?? '—';
  const colorName = (id: string | null) => props.colors.find((c) => c.id === id)?.name ?? '—';

  return (
    <div className="space-y-6">
      {/* Quick master data */}
      <Card><CardContent className="p-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Tag className="h-4 w-4" /> {t('fashion.masterData.title')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <form onSubmit={(e) => { e.preventDefault(); submit((fd) => upsertFashionLookup('size', fd), e.currentTarget); }} className="flex gap-2">
            <Input name="name" placeholder={t('fashion.products.size')} required />
            <Button type="submit" size="sm" variant="outline" disabled={pending}><Plus className="h-4 w-4" />{t('fashion.masterData.sizes')}</Button>
          </form>
          <form onSubmit={(e) => { e.preventDefault(); submit((fd) => upsertFashionLookup('color', fd), e.currentTarget); }} className="flex gap-2">
            <Input name="name" placeholder={t('fashion.products.color')} required />
            <Button type="submit" size="sm" variant="outline" disabled={pending}><Plus className="h-4 w-4" />{t('fashion.masterData.colors')}</Button>
          </form>
        </div>
      </CardContent></Card>

      {/* New style */}
      <Card><CardContent className="p-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Shirt className="h-4 w-4" /> {t('fashion.products.newStyle')}</h2>
        <form onSubmit={(e) => { e.preventDefault(); submit(createStyle, e.currentTarget, (fd, data) => recordProduct(fd, data as string | undefined)); }} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Input name="name" placeholder={t('fashion.products.namePlaceholder')} required />
          <select name="category_id" className="h-9 rounded-md border bg-background px-2 text-sm"><option value="">{t('fashion.products.category')}</option>{props.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select name="brand_id" className="h-9 rounded-md border bg-background px-2 text-sm"><option value="">{t('fashion.products.brand')}</option>{props.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <select name="season_id" className="h-9 rounded-md border bg-background px-2 text-sm"><option value="">{t('fashion.products.season')}</option>{props.seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select name="gender" className="h-9 rounded-md border bg-background px-2 text-sm"><option value="">{t('fashion.products.gender')}</option><option value="men">men</option><option value="women">women</option><option value="boys">boys</option><option value="girls">girls</option><option value="unisex">unisex</option></select>
          <select name="default_supplier_id" className="h-9 rounded-md border bg-background px-2 text-sm"><option value="">{t('fashion.suppliers.name')}</option>{props.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <Button type="submit" size="sm" disabled={pending}><Plus className="h-4 w-4" />{t('fashion.common.add')}</Button>
        </form>
      </CardContent></Card>

      {/* Styles + variants */}
      {props.styles.length === 0 ? (
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{t('fashion.products.empty')}</p>
      ) : props.styles.map((style) => {
        const vs = props.variants.filter((v) => v.style_id === style.id);
        const open = openStyle === style.id;
        return (
          <Card key={style.id}><CardContent className="p-4">
            <button onClick={() => setOpenStyle(open ? null : style.id)} className="flex w-full items-center justify-between gap-2 text-start">
              <span className="font-medium">{style.name} {style.gender ? <span className="text-xs text-muted-foreground">· {style.gender}</span> : null}</span>
              <span className="text-xs text-muted-foreground">{t('fashion.products.variantCount', { count: vs.length })}</span>
            </button>

            {open && (
              <div className="mt-3 space-y-3">
                {vs.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="text-start text-xs text-muted-foreground">
                        <th className="p-1 text-start">{t('fashion.products.size')}</th><th className="p-1 text-start">{t('fashion.products.color')}</th>
                        <th className="p-1 text-start">{t('fashion.products.sku')}</th><th className="p-1 text-start">{t('fashion.products.barcode')}</th>
                        <th className="p-1 text-end">{t('fashion.products.cashPrice')}</th><th className="p-1 text-end">{t('fashion.products.installmentPrice')}</th>
                        <th className="p-1 text-end">{t('fashion.products.minStock')}</th>
                      </tr></thead>
                      <tbody>{vs.map((v) => (
                        <tr key={v.id} className="border-t">
                          <td className="p-1">{sizeName(v.size_id)}</td><td className="p-1">{colorName(v.color_id)}</td>
                          <td className="p-1 font-mono text-xs">{v.product?.code}</td><td className="p-1 font-mono text-xs">{v.product?.barcode}</td>
                          <td className="p-1 text-end tabular-nums">{v.product?.sell_price}</td><td className="p-1 text-end tabular-nums">{v.installment_price}</td>
                          <td className="p-1 text-end tabular-nums">{v.product?.min_stock}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
                <form onSubmit={(e) => { e.preventDefault(); submit(createVariant, e.currentTarget, (fd, data) => recordProduct(fd, (data as { id?: string } | undefined)?.id)); }} className="grid items-end gap-2 rounded-md border p-2 sm:grid-cols-3 lg:grid-cols-7">
                  <input type="hidden" name="style_id" value={style.id} />
                  <label className="text-xs">{t('fashion.products.size')}<select name="size_id" className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="">—</option>{props.sizes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                  <label className="text-xs">{t('fashion.products.color')}<select name="color_id" className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="">—</option>{props.colors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                  <label className="text-xs">{t('fashion.products.cost')}<Input name="cost_price" type="number" step="0.01" defaultValue="0" className="mt-1" /></label>
                  <label className="text-xs">{t('fashion.products.cashPrice')}<Input name="cash_price" type="number" step="0.01" defaultValue="0" className="mt-1" /></label>
                  <label className="text-xs">{t('fashion.products.installmentPrice')}<Input name="installment_price" type="number" step="0.01" defaultValue="0" className="mt-1" /></label>
                  <label className="text-xs">{t('fashion.products.stock')}<Input name="opening_qty" type="number" step="1" defaultValue="0" className="mt-1" /></label>
                  <Button type="submit" size="sm" disabled={pending}><Plus className="h-4 w-4" />{t('fashion.products.addVariant')}</Button>
                </form>
              </div>
            )}
          </CardContent></Card>
        );
      })}

      <a href="/fashion/inventory" className={buttonVariants({ variant: 'outline', size: 'sm' })}>{t('fashion.dashboard.statLowStock')}</a>
    </div>
  );
}
