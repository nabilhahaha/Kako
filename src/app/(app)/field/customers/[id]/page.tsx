import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { getT } from '@/lib/i18n/server';
import type { Customer360 } from '@/lib/erp/customer-360';

interface FieldRollup { last_visit_at: string | null; visits_30d: number; last_geofence_status: string | null; last_merch_at: string | null; last_competitor_price: number | null }
interface VisitRow { id: string; status: string; checkin_at: string | null; checkout_at: string | null; geofence_status: string | null; distance_m: number | null; duration_min: number | null; reason: string | null; rep: string | null }

function fmt(iso: string | null): string { return iso ? new Date(iso).toLocaleString() : '—'; }

/** Customer field profile (FE-2e): composes the foundation 360 master/ownership
 *  with the Field Execution rollup + visit timeline. The drill-through target
 *  from rep visits and manager alerts. */
export default async function CustomerFieldProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const supabase = await createClient();
  const [{ data: c360 }, { data: rollup }, { data: timeline }] = await Promise.all([
    supabase.rpc('erp_customer_360', { p_customer: id }),
    supabase.rpc('erp_customer_field_360', { p_customer: id }),
    supabase.rpc('erp_fe_customer_visits', { p_customer: id, p_limit: 20 }),
  ]);
  if (!c360) notFound();
  const profile = c360 as Customer360;
  const r = (rollup as FieldRollup | null) ?? { last_visit_at: null, visits_30d: 0, last_geofence_status: null, last_merch_at: null, last_competitor_price: null };
  const visits = (timeline as VisitRow[] | null) ?? [];
  const name = profile.master.name || profile.master.name_en || profile.master.code;

  const Stat = ({ label, value }: { label: string; value: string | number }) => (
    <Card><CardContent className="p-4"><p className="text-lg font-semibold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></CardContent></Card>
  );
  const geoBadge = (s: string | null) =>
    s === 'violation' ? <Badge variant="outline" className="gap-1 text-amber-600"><AlertTriangle className="h-3 w-3" />{t('field.visits.outside')}</Badge>
      : s === 'ok' ? <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" />{t('field.visits.inside')}</Badge> : null;

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href="/field/dashboard" label={t('field.profile.back')} />
      <PageHeader title={name} description={[profile.master.route, profile.master.area].filter(Boolean).join(' · ') || t('field.profile.title')} />

      {/* rollup */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label={t('field.profile.visits30d')} value={r.visits_30d} />
        <Stat label={t('field.profile.lastVisit')} value={r.last_visit_at ? fmt(r.last_visit_at) : t('field.profile.never')} />
        <Stat label={t('field.profile.lastCompetitorPrice')} value={r.last_competitor_price != null ? Number(r.last_competitor_price).toFixed(2) : t('field.profile.never')} />
      </div>

      {/* ownership */}
      <Card className="mb-4"><CardContent className="grid grid-cols-2 gap-3 p-4 text-sm">
        <div><p className="text-xs text-muted-foreground">{t('field.profile.accountOwner')}</p><p>{profile.ownership.account_owner?.name ?? '—'}</p></div>
        <div><p className="text-xs text-muted-foreground">{t('field.profile.routeOwner')}</p><p>{profile.ownership.route_owner?.name ?? '—'}</p></div>
      </CardContent></Card>

      {/* timeline */}
      <h3 className="mb-2 font-semibold">{t('field.profile.timeline')}</h3>
      {visits.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{t('field.profile.noVisits')}</CardContent></Card>
      ) : (
        <ol className="space-y-2">
          {visits.map((v) => (
            <li key={v.id}>
              <Card><CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {v.status === 'in_progress'
                    ? <Badge className="gap-1"><Clock className="h-3 w-3" />{t('field.visits.inProgress')}</Badge>
                    : <Badge variant="secondary">{t('field.visits.completed')}</Badge>}
                  {geoBadge(v.geofence_status)}
                  {v.distance_m != null && <span className="text-xs text-muted-foreground">{Math.round(v.distance_m)} {t('field.dashboard.metersFromStore')}</span>}
                  {v.duration_min != null && <span className="text-xs text-muted-foreground">· {v.duration_min} {t('field.dashboard.min')}</span>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span dir="ltr">{fmt(v.checkin_at)}</span>
                  {v.rep && <span>· {v.rep}</span>}
                  {v.reason && <span>· {t('field.profile.reason')}: {v.reason}</span>}
                </div>
              </CardContent></Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
