'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { upsertProduct, toggleProductActive, createCategory } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { FormSection } from '@/components/shared/form-section';
import { ListSearch } from '@/components/list-search';
import { FieldError } from '@/components/ui/field-error';
import { PRODUCT_UNIT_OPTIONS, PRODUCT_UNIT_LABELS } from '@/lib/erp/constants';
import { formatCurrency } from '@/lib/utils';
import type { ProductCatalog, ProductCategory } from '@/lib/erp/types';
import { Plus, Pencil, Loader2, X, Package, Tags } from 'lucide-react';
import { toast } from 'sonner';
import { DrugCatalogPicker } from './drug-catalog-picker';
import { useI18n } from '@/lib/i18n/provider';
import { ETA_UNIT_TYPES } from '@/lib/eta/codes';

export function ProductsManager({
  products,
  categories,
  showDrugCatalog = false,
  etaEnabled = false,
  q = '',
}: {
  products: ProductCatalog[];
  categories: ProductCategory[];
  showDrugCatalog?: boolean;
  etaEnabled?: boolean;
  q?: string;
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState<ProductCatalog | null | 'new'>(null);
  const [showCategory, setShowCategory] = useState(false);
  const [errors, setErrors] = useState<{ code?: string; name?: string }>({});
  const [pending, startTransition] = useTransition();

  const catName = (id: string | null) =>
    categories.find((c) => c.id === id)?.name_ar ||
    categories.find((c) => c.id === id)?.name ||
    '—';

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const next: { code?: string; name?: string } = {};
    if (!String(formData.get('name') ?? '').trim()) next.name = t('products.validationNameRequired');
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    startTransition(async () => {
      const res = await upsertProduct(formData);
      if (!res.ok) {
        toast.error(res.error ?? t('products.toastError'));
        return;
      }
      toast.success(editing === 'new' ? t('products.toastProductAdded') : t('products.toastProductUpdated'));
      setEditing(null);
      router.refresh();
    });
  }

  function onToggle(p: ProductCatalog) {
    startTransition(async () => {
      const res = await toggleProductActive(p.id, !p.is_active);
      if (!res.ok) toast.error(res.error ?? t('products.toastError'));
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
        toast.error(res.error ?? t('products.toastError'));
        return;
      }
      toast.success(t('products.toastCategoryAdded'));
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
            <Plus className="h-4 w-4" /> {t('products.btnNewProduct')}
          </Button>
        )}
        <Button variant="outline" onClick={() => setShowCategory((s) => !s)}>
          <Tags className="h-4 w-4" /> {t('products.btnCategories').replace('{count}', String(categories.length))}
        </Button>
        {showDrugCatalog && <DrugCatalogPicker />}
        <ListSearch placeholder={t('products.searchPlaceholder')} className="w-full sm:ms-auto sm:w-64" />
      </div>

      {showCategory && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="mb-3 font-semibold">{t('products.addCategoryHeading')}</h3>
            <form onSubmit={onCreateCategory} className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t('products.categoryCodeLabel')}</Label>
                <Input name="code" dir="ltr" placeholder={t('products.categoryCodePlaceholder')} className="w-28" required />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('products.categoryNameArLabel')}</Label>
                <Input name="name_ar" placeholder={t('products.categoryNameArPlaceholder')} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('products.categoryNameEnLabel')}</Label>
                <Input name="name" placeholder="Beverages" required />
              </div>
              <Button type="submit" size="sm" disabled={pending}>{t('products.btnAddCategory')}</Button>
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
                {editing === 'new'
                  ? t('products.formTitleNew')
                  : t('products.formTitleEdit').replace('{name}', current?.name_ar || current?.name || '')}
              </h3>
              <button onClick={() => setEditing(null)} className="rounded-md p-1 hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={onSubmit} className="space-y-4">
              {current && <input type="hidden" name="id" value={current.id} />}
              <div className="space-y-5">
                <FormSection title={t('products.sectionIdentity')}>
                <Field label={t('products.fieldProductCode')}>
                  <Input name="code" dir="ltr" defaultValue={current?.code ?? ''} placeholder={t('products.productCodePlaceholder')} />
                  <FieldError>{errors.code}</FieldError>
                </Field>
                <Field label={t('products.fieldBarcode')}>
                  <Input name="barcode" dir="ltr" defaultValue={current?.barcode ?? ''} />
                </Field>
                <Field label={t('products.fieldCategory')}>
                  <select name="category_id" defaultValue={current?.category_id ?? ''} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">{t('products.noCategoryOption')}</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name_ar || c.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label={t('products.fieldNameAr')}>
                  <Input name="name_ar" defaultValue={current?.name_ar ?? ''} />
                </Field>
                <Field label={t('products.fieldNameEn')}>
                  <Input name="name" defaultValue={current?.name ?? ''} onChange={() => setErrors((x) => ({ ...x, name: undefined }))} />
                  <FieldError>{errors.name}</FieldError>
                </Field>
                </FormSection>
                <FormSection title={t('products.sectionPricing')}>
                <Field label={t('products.fieldUnit')}>
                  <select name="unit" defaultValue={current?.unit ?? 'piece'} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {PRODUCT_UNIT_OPTIONS.map((u) => (
                      <option key={u.value} value={u.value}>{u[locale]}</option>
                    ))}
                  </select>
                </Field>
                <Field label={t('products.fieldCostPrice')}>
                  <Input name="cost_price" type="number" step="0.01" dir="ltr" defaultValue={current?.cost_price ?? 0} />
                </Field>
                <Field label={t('products.fieldSellPrice')}>
                  <Input name="sell_price" type="number" step="0.01" dir="ltr" defaultValue={current?.sell_price ?? 0} />
                </Field>
                <Field label={t('products.fieldTaxRate')}>
                  <Input name="tax_rate" type="number" step="0.01" dir="ltr" defaultValue={current?.tax_rate ?? 0} />
                </Field>
                <Field label={t('products.fieldMinStock')}>
                  <Input name="min_stock" type="number" step="0.001" dir="ltr" defaultValue={current?.min_stock ?? 0} />
                </Field>
                </FormSection>
                {etaEnabled && (
                  <FormSection title={t('products.sectionEInvoice')}>
                    <Field label={t('products.fieldEtaCodeType')}>
                      <select name="eta_item_code_type" defaultValue={current?.eta_item_code_type ?? ''} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="">{t('products.etaNone')}</option>
                        <option value="EGS">EGS</option>
                        <option value="GS1">GS1</option>
                      </select>
                    </Field>
                    <Field label={t('products.fieldEtaItemCode')}>
                      <Input name="eta_item_code" dir="ltr" defaultValue={current?.eta_item_code ?? ''} />
                    </Field>
                    <Field label={t('products.fieldEtaUnitType')}>
                      <select name="eta_unit_type" defaultValue={current?.eta_unit_type ?? ''} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="">{t('products.etaNone')}</option>
                        {Object.entries(ETA_UNIT_TYPES).map(([code, label]) => (
                          <option key={code} value={code}>{code} · {label[locale]}</option>
                        ))}
                      </select>
                    </Field>
                  </FormSection>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('products.btnSave')}
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>{t('products.btnCancel')}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {products.length === 0 ? (
        <EmptyState
          icon={<Package />}
          title={q ? t('products.emptySearch') : t('products.emptyProducts')}
          description={q ? undefined : t('products.emptyProductsHint')}
          action={!q && editing === null ? (
            <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> {t('products.btnNewProduct')}</Button>
          ) : undefined}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('products.colCode')}</th>
                    <th className="p-3 text-start font-medium">{t('products.colProduct')}</th>
                    <th className="p-3 text-start font-medium">{t('products.colCategory')}</th>
                    <th className="p-3 text-start font-medium">{t('products.colUnit')}</th>
                    <th className="p-3 text-end font-medium">{t('products.colCost')}</th>
                    <th className="p-3 text-end font-medium">{t('products.colSell')}</th>
                    <th className="p-3 text-center font-medium">{t('products.colStatus')}</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-secondary/30">
                      <td className="p-3 font-mono text-xs" dir="ltr">{p.code}</td>
                      <td className="p-3 font-medium">{p.name_ar || p.name}</td>
                      <td className="p-3 text-muted-foreground">{catName(p.category_id)}</td>
                      <td className="p-3 text-muted-foreground">{PRODUCT_UNIT_LABELS[p.unit]?.[locale] ?? p.unit}</td>
                      <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(p.cost_price)}</td>
                      <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(p.sell_price)}</td>
                      <td className="p-3 text-center">
                        {p.is_active ? (
                          <Badge variant="success">{t('products.statusActive')}</Badge>
                        ) : (
                          <Badge variant="destructive">{t('products.statusInactive')}</Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setEditing(p)} className="rounded-md p-1.5 hover:bg-secondary" aria-label={t('products.ariaEdit')}>
                            <Pencil className="h-4 w-4" />
                          </button>
                          <Button variant="ghost" size="sm" disabled={pending} onClick={() => onToggle(p)} className="text-xs">
                            {p.is_active ? t('products.btnDeactivate') : t('products.btnActivate')}
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
