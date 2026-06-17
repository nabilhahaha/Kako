import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { isVanSalesActive } from '@/lib/van-sales/settings-server';

export const dynamic = 'force-dynamic';

// Van Sales — warehouse pending-confirmations dashboard (read-only, desktop). Shows
// loads awaiting salesman confirmation and variance cases under review. Gated
// per-tenant + stock.adjust (warehouse/keeper). No mutations here.
export default async function VanSalesWarehousePage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) notFound();
  if (!hasPermission(ctx, 'stock.adjust') && !ctx.isSuperAdmin) redirect('/dashboard');

  const { t } = await getT();

  // Loaded manifests minus any already confirmed → awaiting salesman confirmation.
  const { data: manifests } = await supabase
    .from('erp_van_load_manifests')
    .select('id, manifest_number, salesman_id, manifest_date')
    .eq('status', 'loaded')
    .order('manifest_date', { ascending: false })
    .limit(50);
  const mIds = (manifests ?? []).map((m) => (m as { id: string }).id);
  let confirmed = new Set<string>();
  if (mIds.length) {
    const { data: c } = await supabase.from('erp_van_load_confirmations').select('manifest_id').in('manifest_id', mIds);
    confirmed = new Set((c ?? []).map((x) => (x as { manifest_id: string }).manifest_id));
  }
  const pending = (manifests ?? []).filter((m) => !confirmed.has((m as { id: string }).id)) as { id: string; manifest_number: string | null; salesman_id: string | null; manifest_date: string }[];

  // Variance cases awaiting review.
  const { data: variance } = await supabase
    .from('erp_van_load_confirmations')
    .select('id, manifest_id, status, review_status, created_at')
    .eq('requires_review', true)
    .eq('review_status', 'pending')
    .order('created_at', { ascending: false })
    .limit(50);
  const varianceRows = (variance ?? []) as { id: string; status: string; review_status: string; created_at: string }[];

  // Salesman emails for display.
  const salesIds = [...new Set(pending.map((p) => p.salesman_id).filter(Boolean))] as string[];
  const { data: profiles } = salesIds.length
    ? await supabase.from('erp_profiles').select('id, email').in('id', salesIds)
    : { data: [] };
  const emailById = new Map((profiles ?? []).map((p) => [(p as { id: string }).id, (p as { email: string | null }).email]));

  return (
    <div className="space-y-6">
      <BackLink href="/field/van-sales" home="/inventory/requests" label={t('common.back')} />
      <PageHeader title={t('vanSales.warehouse.title')} description={t('vanSales.warehouse.subtitle')} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{pending.length}</div><div className="text-sm text-muted-foreground">{t('vanSales.warehouse.pendingConfirmation')}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{varianceRows.length}</div><div className="text-sm text-muted-foreground">{t('vanSales.warehouse.varianceCases')}</div></CardContent></Card>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">{t('vanSales.warehouse.pendingConfirmation')}</h3>
        <Card><CardContent className="pt-6">
          {pending.length === 0 ? <p className="text-sm text-muted-foreground">{t('vanSales.warehouse.none')}</p> : (
            <div className="divide-y divide-border">
              {pending.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="font-medium">{m.manifest_number ?? m.id.slice(0, 8)}</span>
                  <span className="text-muted-foreground">{emailById.get(m.salesman_id ?? '') ?? '—'}</span>
                  <span className="text-xs text-muted-foreground">{m.manifest_date}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent></Card>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">{t('vanSales.warehouse.varianceCases')}</h3>
        <Card><CardContent className="pt-6">
          {varianceRows.length === 0 ? <p className="text-sm text-muted-foreground">{t('vanSales.warehouse.none')}</p> : (
            <div className="divide-y divide-border">
              {varianceRows.map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="font-medium">{v.id.slice(0, 8)}</span>
                  <Badge variant="outline">{v.status}</Badge>
                  <Badge variant="secondary">{v.review_status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent></Card>
      </section>
    </div>
  );
}
