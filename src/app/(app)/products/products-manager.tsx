'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { upsertProduct, toggleProductActive, createCategory } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { FieldError } from '@/components/ui/field-error';
import { PRODUCT_UNIT_OPTIONS, PRODUCT_UNIT_LABELS } from '@/lib/erp/constants';
import { formatCurrency } from '@/lib/utils';
import type { ProductCatalog, ProductCategory } from '@/lib/erp/types';
import { Plus, Pencil, Loader2, X, Package, Search, Tags } from 'lucide-react';
import { toast } from 'sonner';

export function ProductsManager({
  products,
  categories,
}: {
  products: ProductCatalog[];
  categories: ProductCategory[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ProductCatalog | null | 'new'>(null);
  const [showCategory, setShowCategory] = useState(false);
  const [query, setQuery] = useState('');
  const [errors, setErrors] = useState<{ code?: string; name?: string }>({});
  const [pending, startTransition] = useTransition();

  const catName = (id: string | null) =>
    categories.find((c) => c.id === id)?.name_ar ||
    categories.find((c) => c.id === id)?.name ||
    '—';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.name_ar || '').toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q),
    );
  }, [products, query]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const next: { code?: string; name?: string } = {};
    if (!String(formData.get('code') ?? '').trim()) next.code = 'كود المنتج مطلوب.';
    if (!String(formData.get('name') ?? '').trim()) next.name = 'الاسم (إنجليزي) مطلوب.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    startTransition(async () => {
      const res = await upsertProduct(formData);
      if (!res.ok) {
        toast.error(res.error ?? 'حدث خطأ');
        return;
      }
      toast.success(editing === 'new' ? 'تمت إضافة المنتج' : 'تم تحديث المنتج');
      setEditing(null);
      router.refresh();
    });
  }

  function onToggle(p: ProductCatalog) {
    startTransition(async () => {
      const res = await toggleProductActive(p.id, !p.is_active);
      if (!res.ok) toast.error(res.error ?? 'حدث خطأ');
      else router.refresh();
    });
  }

  function onCreateCategory(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const res = await createCategory(formData);
      if (!res.ok) {
        toast.error(res.error ?? 'حدث خطأ');
        return;
      }
      toast.success('تمت إضافة التصنيف');
      form.reset();
      setShowCategory(false);
      router.refresh();
    });
  }

  const current = editing === 'new' ? null : editing;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {editing === null && (
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> منتج جديد
          </Button>
        )}
        <Button variant="outline" onClick={() => setShowCategory((s) => !s)}>
          <Tags className="h-4 w-4" /> التصنيفات ({categories.length})
        </Button>
        <div className="relative ms-auto">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث بالكود أو الاسم أو الباركود…"
            className="w-64 pr-9"
          />
        </div>
      </div>

      {showCategory && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="mb-3 font-semibold">إضافة تصنيف</h3>
            <form onSubmit={onCreateCategory} className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">الكود *</Label>
                <Input name="code" dir="ltr" placeholder="BEV" className="w-28" required />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الاسم (عربي)</Label>
                <Input name="name_ar" placeholder="مشروبات" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الاسم (إنجليزي) *</Label>
                <Input name="name" placeholder="Beverages" required />
              </div>
              <Button type="submit" size="sm" disabled={pending}>إضافة</Button>
            </form>
            {categories.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {categories.map((c) => (
                  <Badge key={c.id} variant="secondary">
                    {c.code} · {c.name_ar || c.name}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {editing !== null && (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">
                {editing === 'new' ? 'منتج جديد' : `تعديل: ${current?.name_ar || current?.name}`}
              </h3>
              <button onClick={() => setEditing(null)} className="rounded-md p-1 hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={onSubmit} className="space-y-4">
              {current && <input type="hidden" name="id" value={current.id} />}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="كود المنتج *">
                  <Input name="code" dir="ltr" defaultValue={current?.code ?? ''} onChange={() => setErrors((x) => ({ ...x, code: undefined }))} />
                  <FieldError>{errors.code}</FieldError>
                </Field>
                <Field label="الباركود">
                  <Input name="barcode" dir="ltr" defaultValue={current?.barcode ?? ''} />
                </Field>
                <Field label="التصنيف">
                  <select name="category_id" defaultValue={current?.category_id ?? ''} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">بدون تصنيف</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name_ar || c.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="الاسم (عربي)">
                  <Input name="name_ar" defaultValue={current?.name_ar ?? ''} />
                </Field>
                <Field label="الاسم (إنجليزي) *">
                  <Input name="name" defaultValue={current?.name ?? ''} onChange={() => setErrors((x) => ({ ...x, name: undefined }))} />
                  <FieldError>{errors.name}</FieldError>
                </Field>
                <Field label="الوحدة">
                  <select name="unit" defaultValue={current?.unit ?? 'piece'} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {PRODUCT_UNIT_OPTIONS.map((u) => (
                      <option key={u.value} value={u.value}>{u.ar}</option>
                    ))}
                  </select>
                </Field>
                <Field label="سعر التكلفة">
                  <Input name="cost_price" type="number" step="0.01" dir="ltr" defaultValue={current?.cost_price ?? 0} />
                </Field>
                <Field label="سعر البيع">
                  <Input name="sell_price" type="number" step="0.01" dir="ltr" defaultValue={current?.sell_price ?? 0} />
                </Field>
                <Field label="ضريبة % (مثال: 14)">
                  <Input name="tax_rate" type="number" step="0.01" dir="ltr" defaultValue={current?.tax_rate ?? 0} />
                </Field>
                <Field label="حد إعادة الطلب">
                  <Input name="min_stock" type="number" step="0.001" dir="ltr" defaultValue={current?.min_stock ?? 0} />
                </Field>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>إلغاء</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
            <Package className="h-8 w-8" />
            <p>{products.length === 0 ? 'لا توجد منتجات بعد. أضف أول منتج.' : 'لا توجد نتائج مطابقة.'}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-right font-medium">الكود</th>
                    <th className="p-3 text-right font-medium">المنتج</th>
                    <th className="p-3 text-right font-medium">التصنيف</th>
                    <th className="p-3 text-right font-medium">الوحدة</th>
                    <th className="p-3 text-left font-medium">التكلفة</th>
                    <th className="p-3 text-left font-medium">البيع</th>
                    <th className="p-3 text-center font-medium">الحالة</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-secondary/30">
                      <td className="p-3 font-mono text-xs" dir="ltr">{p.code}</td>
                      <td className="p-3 font-medium">{p.name_ar || p.name}</td>
                      <td className="p-3 text-muted-foreground">{catName(p.category_id)}</td>
                      <td className="p-3 text-muted-foreground">{PRODUCT_UNIT_LABELS[p.unit]?.ar ?? p.unit}</td>
                      <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(p.cost_price)}</td>
                      <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(p.sell_price)}</td>
                      <td className="p-3 text-center">
                        {p.is_active ? (
                          <Badge variant="success">نشط</Badge>
                        ) : (
                          <Badge variant="destructive">موقوف</Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setEditing(p)} className="rounded-md p-1.5 hover:bg-secondary" aria-label="تعديل">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <Button variant="ghost" size="sm" disabled={pending} onClick={() => onToggle(p)} className="text-xs">
                            {p.is_active ? 'إيقاف' : 'تفعيل'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
