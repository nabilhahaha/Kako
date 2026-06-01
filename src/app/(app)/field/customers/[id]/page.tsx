import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, Clock, ClipboardList } from 'lucide-react';
import { getT } from '@/lib/i18n/server';
import type { Customer360 } from '@/lib/erp/customer-360';
import type { CaptureKind } from '@/lib/erp/field-capture';

interface FieldRollup {
  last_visit_at: string | null; visits_30d: number; last_geofence_status: string | null; last_merch_at: string | null; last_competitor_price: number | null;
  frequency: string | null; next_due: string | null; adherence_pct: number | null; planned_30d: number; fulfilled_30d: number;
}
interface VisitRow { id: string; status: string; checkin_at: string | null; checkout_at: string | null; geofence_status: string | null; distance_m: number | null; duration_min: number | null; reason: string | null; rep: string | null }
interface CaptureRow { id: string; kind: CaptureKind; score: number | null; created_at: string; erp_form_definitions: { name_ar?: string; name_en?: string } | null }

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
  const [{ data: c360 }, { data: rollup }, { data: timeline }, { data: capRows }, { data: canExec }] = await Promise.all([
    supabase.rpc('erp_customer_360', { p_customer: id }),
    supabase.rpc('erp_customer_field_360', { p_customer: id }),
    supabase.rpc('erp_fe_customer_visits', { p_customer: id, p_limit: 20 }),
    supabase.from('erp_fe_captures').select('id, kind, score, created_at, erp_form_definitions:form_id(name_ar, name_en)').eq('customer_id', id).order('created_at', { ascending: false }).limit(15),
    supabase.rpc('erp_fe_capture_kinds'),
  ]);
  if (!c360) notFound();
  const profile = c360 as Customer360;
  const captures = (capRows as CaptureRow[] | null) ?? [];
  const canCapture = ((canExec as string[] | null) ?? []).length > 0;
  const r = (rollup as FieldRollup | null) ?? { last_visit_at: null, visits_30d: 0, last_geofence_status: null, last_merch_at: null, last_competitor_price: null, frequency: null, next_due: null, adherence_pct: null, planned_30d: 0, fulfilled_30d: 0 };
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

      {canCapture && (
        <Link href={`/field/capture?customer=${id}`} className="mb-4 block">
          <Button className="h-12 w-full"><ClipboardList className="h-5 w-5" /> {t('field.capture.capture')}</Button>
        </Link>
      )}

      {/* rollup */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label={t('field.profile.visits30d')} value={r.visits_30d} />
        <Stat label={t('field.profile.lastVisit')} value={r.last_visit_at ? fmt(r.last_visit_at) : t('field.profile.never')} />
        <Stat label={t('field.profile.frequency')} value={r.frequency ?? t('field.profile.never')} />
        <Stat label={t('field.profile.nextDue')} value={r.next_due ?? t('field.profile.never')} />
        <Stat label={t('field.profile.adherence')} value={r.adherence_pct != null ? `${r.adherence_pct}% (${r.fulfilled_30d}/${r.planned_30d})` : t('field.profile.never')} />
        <Stat label={t('field.profile.lastCompetitorPrice')} value={r.last_competitor_price != null ? Number(r.last_competitor_price).toFixed(2) : t('field.profile.never')} />
      </div>

      {/* ownership */}
      <Card className="mb-4"><CardContent className="grid grid-cols-2 gap-3 p-4 text-sm">
        <div><p className="text-xs text-muted-foreground">{t('field.profile.accountOwner')}</p><p>{profile.ownership.account_owner?.name ?? '—'}</p></div>
        <div><p className="text-xs text-muted-foreground">{t('field.profile.routeOwner')}</p><p>{profile.ownership.route_owner?.name ?? '—'}</p></div>
      </CardContent></Card>

      {/* captures (FE-4b) */}
      {captures.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 font-semibold">{t('field.capture.history')}</h3>
          <div className="space-y-2">
            {captures.map((cap) => (
              <Card key={cap.id}><CardContent className="flex items-center justify-between gap-2 p-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{cap.erp_form_definitions?.name_en || cap.erp_form_definitions?.name_ar || t(`field.capture.kinds.${cap.kind}`)}</span>
                  <span className="text-xs text-muted-foreground" dir="ltr">{fmt(cap.created_at)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge variant="secondary">{t(`field.capture.kinds.${cap.kind}`)}</Badge>
                  {cap.score != null && <Badge variant="outline">{t('field.capture.score')}: {cap.score}</Badge>}
                </span>
              </CardContent></Card>
            ))}
          </div>
        </div>
      )}

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
