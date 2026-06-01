import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { VisitsClient, type ServerVisit, type PickCustomer, type FeSettings } from './visits-client';

/** My Visits — Today (FE-2d). Rep-facing, mobile-first. Loads the rep's visits
 *  for today, the customer picker list and the company geofence settings; the
 *  client component owns GPS capture + the offline outbox. */
export default async function FieldVisitsPage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const companyId = ctx.company?.id;
  if (!companyId || !ctx.modules.includes('field_ops')) {
    return (
      <div>
        <PageHeader title={t('field.visits.title')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('field.visits.noVisits')}</CardContent></Card>
      </div>
    );
  }

  const supabase = await createClient();
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);

  const [{ data: visitRows }, { data: customerRows }, { data: settingsRow }] = await Promise.all([
    supabase.from('erp_fe_visits')
      .select('id, client_ref, status, checkin_at, checkout_at, geofence_status, distance_m, duration_min, customer_id, erp_customers(name, code)')
      .eq('rep_id', ctx.userId)
      .gte('checkin_at', startOfToday.toISOString())
      .order('checkin_at', { ascending: false }),
    supabase.from('erp_customers')
      .select('id, name, code, latitude, longitude')
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(500),
    supabase.from('erp_fe_settings')
      .select('geofence_radius_m, geofence_mode, geofence_photo_threshold_m')
      .eq('company_id', companyId)
      .maybeSingle(),
  ]);

  const visits: ServerVisit[] = ((visitRows as Record<string, unknown>[]) ?? []).map((r) => {
    const cust = r.erp_customers as { name?: string; code?: string } | null;
    return {
      id: r.id as string, clientRef: (r.client_ref as string) ?? null, customerId: r.customer_id as string,
      customerName: cust?.name ?? '—', status: r.status as ServerVisit['status'],
      checkinAt: (r.checkin_at as string) ?? null, checkoutAt: (r.checkout_at as string) ?? null,
      geofenceStatus: (r.geofence_status as string) ?? null, distanceM: (r.distance_m as number) ?? null,
      durationMin: (r.duration_min as number) ?? null,
    };
  });
  const customers: PickCustomer[] = ((customerRows as Record<string, unknown>[]) ?? []).map((r) => ({
    id: r.id as string, name: r.name as string, code: (r.code as string) ?? null,
    lat: (r.latitude as number) ?? null, lng: (r.longitude as number) ?? null,
  }));
  const s = settingsRow as { geofence_radius_m?: number; geofence_mode?: string; geofence_photo_threshold_m?: number } | null;
  const settings: FeSettings = {
    radiusM: s?.geofence_radius_m ?? 150,
    mode: (s?.geofence_mode as 'advisory' | 'blocking') ?? 'advisory',
    photoThresholdM: s?.geofence_photo_threshold_m ?? 500,
  };

  return (
    <div className="mx-auto max-w-md">
      <VisitsClient visits={visits} customers={customers} settings={settings} />
    </div>
  );
}
