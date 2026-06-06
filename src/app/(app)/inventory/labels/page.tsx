import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { LabelPrinter, type LabelProduct } from './label-printer';

/**
 * Barcode label printing — batch, thermal-friendly labels for products/variants.
 * Reuses the POS-compatible Code 39 renderer (no external dependency). Size/color
 * are pulled from the fashion variant bridge when present.
 */
export default async function BarcodeLabelsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();

  const supabase = await createClient();
  const [{ data: products }, { data: variants }] = await Promise.all([
    supabase
      .from('erp_products_catalog')
      .select('id, code, name, name_ar, barcode, sell_price')
      .eq('is_active', true)
      .order('name')
      .limit(3000),
    supabase
      .from('erp_fashion_variants')
      .select('product_id, size:erp_fashion_sizes(name), color:erp_fashion_colors(name, name_ar)'),
  ]);

  const variantMap = new Map(
    ((variants as unknown as { product_id: string; size: { name: string } | null; color: { name: string; name_ar: string | null } | null }[]) ?? [])
      .map((v) => [v.product_id, { size: v.size?.name ?? null, color: v.color?.name_ar ?? v.color?.name ?? null }]),
  );

  const items: LabelProduct[] = ((products as { id: string; code: string; name: string; name_ar: string | null; barcode: string | null; sell_price: number }[]) ?? []).map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    name_ar: p.name_ar,
    barcode: p.barcode,
    sell_price: Number(p.sell_price),
    size: variantMap.get(p.id)?.size ?? null,
    color: variantMap.get(p.id)?.color ?? null,
  }));

  return (
    <div>
      <div className="print:hidden">
        <PageHeader title={t('ops.lblTitle')} description={t('ops.lblDescription')} />
      </div>
      <LabelPrinter products={items} />
    </div>
  );
}
