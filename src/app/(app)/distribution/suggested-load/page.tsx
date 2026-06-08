import { redirect } from 'next/navigation';
import { Boxes, Layers, ListChecks } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { SUGGESTED_LOAD_ENABLED } from '@/lib/suggested-load';

export const dynamic = 'force-dynamic';

type Sheet = { id: string; load_date: string; warehouse_id: string | null; status: string; total_suggested_units: number };
type Line = { id: string; product_id: string | null; projected_demand: number; current_van_stock: number; suggested_load: number };

const fmt = (n: number | null | undefined): string => Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

export default async function SuggestedLoadPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'reports.view')) redirect('/dashboard');

  const { t } = await getT();

  if (!SUGGESTED_LOAD_ENABLED()) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('distribution.slTitle')} description={t('distribution.slDescription')} />
        <EmptyState icon={<Boxes className="h-7 w-7" />} title={t('distribution.slDisabled')} />
      </div>
    );
  }

  const supabase = await createClient();
  const { data: sheetData } = await supabase
    .from('erp_suggested_loads')
    .select('id, load_date, warehouse_id, status, total_suggested_units')
    .order('load_date', { ascending: false })
    .limit(30);
  const sheets = (sheetData ?? []) as Sheet[];

  if (sheets.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('distribution.slTitle')} description={t('distribution.slDescription')} />
        <EmptyState icon={<Boxes className="h-7 w-7" />} title={t('distribution.slEmpty')} />
      </div>
    );
  }

  const latest = sheets[0];
  const { data: lineData } = await supabase
    .from('erp_suggested_load_lines')
    .select('id, product_id, projected_demand, current_van_stock, suggested_load')
    .eq('suggested_load_id', latest.id)
    .order('suggested_load', { ascending: false })
    .limit(100);
  const lines = (lineData ?? []) as Line[];

  const prodNames = new Map<string, string>();
  const prodIds = [...new Set(lines.map((l) => l.product_id).filter(Boolean))] as string[];
  if (prodIds.length) {
    const { data: prods } = await supabase.from('erp_products_catalog').select('id, name').in('id', prodIds);
    for (const p of prods ?? []) prodNames.set(p.id as string, (p.name as string) ?? '');
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('distribution.slTitle')} description={t('distribution.slDescription')} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label={t('distribution.slKpiUnits')} value={fmt(latest.total_suggested_units)} icon={Boxes} tone="primary" />
        <StatCard label={t('distribution.slKpiSheets')} value={String(sheets.length)} icon={Layers} tone="info" />
        <StatCard label={t('distribution.slKpiLines')} value={String(lines.length)} icon={ListChecks} tone="success" />
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">{t('distribution.slSheetsTitle')}</h2>
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="p-2 text-start">{t('distribution.slColDate')}</th>
                <th className="p-2 text-end">{t('distribution.slColUnits')}</th>
                <th className="p-2 text-start">{t('distribution.slColStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {sheets.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="p-2">{s.load_date}</td>
                  <td className="p-2 text-end font-medium">{fmt(s.total_suggested_units)}</td>
                  <td className="p-2">{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {lines.length > 0 && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <h2 className="text-sm font-semibold">{t('distribution.slLinesTitle')}</h2>
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="p-2 text-start">{t('distribution.slColProduct')}</th>
                  <th className="p-2 text-end">{t('distribution.slColDemand')}</th>
                  <th className="p-2 text-end">{t('distribution.slColStock')}</th>
                  <th className="p-2 text-end">{t('distribution.slColSuggested')}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="p-2">{l.product_id ? (prodNames.get(l.product_id) ?? l.product_id) : '—'}</td>
                    <td className="p-2 text-end">{fmt(l.projected_demand)}</td>
                    <td className="p-2 text-end">{fmt(l.current_van_stock)}</td>
                    <td className="p-2 text-end font-medium">{fmt(l.suggested_load)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
