import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { isVanSalesActive } from '@/lib/van-sales/settings-server';
import { ConfirmForm, type ConfirmLineView } from './confirm-form';

export const dynamic = 'force-dynamic';

// Van Sales — salesman load-confirmation screen. Shows the latest loaded manifest
// awaiting confirmation; the salesman accepts/rejects/varies per line and confirms
// (online via confirmLoad, offline via the queue). Only accepted qty posts to van
// stock — server-side, on the same atomic RPC. Gated per-tenant + field.sales.
export default async function VanSalesConfirmPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) notFound();
  if (!hasPermission(ctx, 'field.sales') && !ctx.isSuperAdmin) redirect('/dashboard');

  const { t, locale } = await getT();
  const ar = locale === 'ar';

  // Loaded manifests for this salesman, minus any already confirmed.
  const { data: manifests } = await supabase
    .from('erp_van_load_manifests')
    .select('id, manifest_number, created_at')
    .eq('salesman_id', ctx.userId)
    .eq('status', 'loaded')
    .order('created_at', { ascending: false })
    .limit(20);
  const ids = (manifests ?? []).map((m) => (m as { id: string }).id);
  let confirmed = new Set<string>();
  if (ids.length) {
    const { data: confs } = await supabase.from('erp_van_load_confirmations').select('manifest_id').in('manifest_id', ids);
    confirmed = new Set((confs ?? []).map((c) => (c as { manifest_id: string }).manifest_id));
  }
  const manifest = (manifests ?? []).find((m) => !confirmed.has((m as { id: string }).id)) as { id: string } | undefined;

  let lines: ConfirmLineView[] = [];
  if (manifest) {
    const { data: ml } = await supabase.from('erp_van_load_manifest_lines').select('product_id, loaded_qty').eq('manifest_id', manifest.id);
    const rows = (ml ?? []) as { product_id: string; loaded_qty: number }[];
    const prodIds = rows.map((r) => r.product_id);
    const { data: prods } = prodIds.length
      ? await supabase.from('erp_products_catalog').select('id, name, name_ar').in('id', prodIds)
      : { data: [] };
    const nameById = new Map((prods ?? []).map((p) => [(p as { id: string }).id, p as { name: string; name_ar: string | null }]));
    lines = rows.map((r) => {
      const p = nameById.get(r.product_id);
      return { productId: r.product_id, productName: (ar && p?.name_ar ? p.name_ar : p?.name) ?? r.product_id, loadedQty: Number(r.loaded_qty) };
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('vanSales.confirm.title')} description={t('vanSales.confirm.subtitle')} />
      {!manifest || lines.length === 0 ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t('vanSales.confirm.noPending')}</CardContent></Card>
      ) : (
        <ConfirmForm manifestId={manifest.id} lines={lines} />
      )}
    </div>
  );
}
