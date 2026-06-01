import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { RouteClient, type RouteStop } from './route-client';
import type { FeSettings } from '../start-visit-sheet';
import { EvidenceProvider } from '@/components/field/evidence-context';

/** Rep "My Route Today" (FE-3c): today's published plan stops with status,
 *  distance and one-tap Start. */
export default async function MyRoutePage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const companyId = ctx.company?.id;
  if (!companyId || !ctx.modules.includes('field_ops')) {
    return <div><PageHeader title={t('field.route.title')} /><Card><CardContent className="p-8 text-center text-muted-foreground">{t('field.route.noPlan')}</CardContent></Card></div>;
  }

  const supabase = await createClient();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  const { data: planRow } = await supabase
    .from('erp_fe_route_plans')
    .select('id, plan_date, status')
    .eq('rep_id', ctx.userId).eq('plan_date', todayStr).in('status', ['published', 'in_progress'])
    .order('published_at', { ascending: false }).limit(1).maybeSingle();
  const plan = planRow as { id: string; plan_date: string; status: string } | null;

  const [{ data: settingsRow }, { count: offPlan }] = await Promise.all([
    supabase.from('erp_fe_settings').select('geofence_radius_m, geofence_mode, geofence_photo_threshold_m').eq('company_id', companyId).maybeSingle(),
    supabase.from('erp_fe_visits').select('id', { count: 'exact', head: true }).eq('rep_id', ctx.userId).is('plan_id', null).gte('checkin_at', today.toISOString()),
  ]);
  const s = settingsRow as { geofence_radius_m?: number; geofence_mode?: string; geofence_photo_threshold_m?: number } | null;
  const settings: FeSettings = { radiusM: s?.geofence_radius_m ?? 150, mode: (s?.geofence_mode as 'advisory' | 'blocking') ?? 'advisory', photoThresholdM: s?.geofence_photo_threshold_m ?? 500 };

  if (!plan) {
    return <div className="mx-auto max-w-md"><PageHeader title={t('field.route.title')} /><Card><CardContent className="p-8 text-center text-muted-foreground">{t('field.route.noPlan')}</CardContent></Card></div>;
  }

  const { data: stopRows } = await supabase
    .from('erp_fe_route_stops')
    .select('id, seq, status, priority, due, customer_id, erp_customers(name, code, latitude, longitude)')
    .eq('plan_id', plan.id).order('seq', { ascending: true });

  const stops: RouteStop[] = ((stopRows as Record<string, unknown>[]) ?? []).filter((r) => r.due).map((r) => {
    const c = r.erp_customers as { name?: string; code?: string; latitude?: number; longitude?: number } | null;
    return { id: r.id as string, seq: r.seq as number, status: r.status as RouteStop['status'], priority: (r.priority as string) ?? 'B', customerId: r.customer_id as string, customerName: c?.name ?? '—', lat: c?.latitude ?? null, lng: c?.longitude ?? null };
  });

  return (
    <div className="mx-auto max-w-md">
      <EvidenceProvider companyId={companyId}>
        <RouteClient stops={stops} settings={settings} routeId={null} offPlanCount={offPlan ?? 0} />
      </EvidenceProvider>
    </div>
  );
}
