'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/provider';
import { rankNextCustomers, formatDistance, type NextCandidate, type RankedCandidate, type GpsPoint } from '@/lib/van-sales/next-customer';
import { setActiveVisit } from '@/lib/van-sales/active-visit';
import { logFieldUxEvent } from '@/lib/van-sales/ux-metrics-server';
import { NavigateButton } from '@/components/field/navigate-button';
import { PendingLink } from '@/components/shared/pending-link';
import { CheckCircle2, MapPin, Play, AlertTriangle, CreditCard, Route } from 'lucide-react';

// Smart Next Customer — after Complete Visit (mode 'completed') or at Start Day
// (mode 'startday'). Ranking is route-first (sequence primary, distance
// secondary) and runs in the pure engine; this screen only supplies the live GPS
// origin and renders the result. Start Visit opens the customer visit directly;
// Navigate opens the device map (Google / Apple / Waze).
export function SmartNextScreen({
  candidates,
  total,
  mode,
}: {
  candidates: NextCandidate[];
  total: number;
  mode: 'completed' | 'startday';
}) {
  const { t, locale } = useI18n();
  const [origin, setOrigin] = useState<GpsPoint | null>(null);
  const [locating, setLocating] = useState(true);

  useEffect(() => {
    void logFieldUxEvent({ eventType: 'smart_next_viewed', meta: { mode, count: candidates.length } });
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setLocating(false); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocating(false); },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ranked = useMemo(() => rankNextCustomers(candidates, origin, { limit: 5 }), [candidates, origin]);
  const top = ranked[0];

  return (
    <div className="space-y-4">
      {/* Header by mode */}
      <Card>
        <CardContent className="flex items-start gap-3 p-4">
          {mode === 'completed'
            ? <CheckCircle2 className="mt-0.5 h-7 w-7 shrink-0 text-success" />
            : <Route className="mt-0.5 h-7 w-7 shrink-0 text-primary" />}
          <div>
            <p className="text-lg font-bold">{t(mode === 'completed' ? 'vanSales.smartNext.completedTitle' : 'vanSales.smartNext.startDayTitle')}</p>
            <p className="text-sm text-muted-foreground">{t(mode === 'completed' ? 'vanSales.smartNext.completedSubtitle' : 'vanSales.smartNext.startDaySubtitle')}</p>
            {locating && <p className="mt-1 text-xs text-muted-foreground">{t('vanSales.smartNext.locating')}</p>}
            {!locating && !origin && ranked.length > 0 && <p className="mt-1 text-xs text-warning">{t('vanSales.smartNext.noGps')}</p>}
          </div>
        </CardContent>
      </Card>

      {ranked.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{t('vanSales.smartNext.noCandidates')}</CardContent></Card>
      ) : (
        <>
          {/* Start Day: highlight the single next planned customer. */}
          {mode === 'startday' && top && <NextCard c={top} total={total} primary />}
          <div className="space-y-2">
            {mode === 'completed' && <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('vanSales.smartNext.nearestTitle')}</p>}
            {(mode === 'startday' ? ranked.slice(1) : ranked).map((c) => (
              <NextCard key={c.customerId} c={c} total={total} />
            ))}
          </div>
        </>
      )}

      <Link href="/field/journey" className={`w-full ${buttonVariants({ variant: 'outline' })}`}>
        <MapPin className="h-4 w-4" /> {t('vanSales.smartNext.backToRoute')}
      </Link>
    </div>
  );
}

function NextCard({ c, total, primary }: { c: RankedCandidate; total: number; primary?: boolean }) {
  const { t, locale } = useI18n();
  const name = (locale === 'ar' && c.nameAr) ? c.nameAr : c.name;
  const startHref = `/field/van-sales/statement/${c.customerId}?from=route&seq=${c.sequence}&total=${total}&src=smart_next`;
  return (
    <Card className={primary ? 'border-primary/50 bg-primary/5' : ''}>
      <CardContent className="space-y-2.5 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">{name}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="gap-1"><Route className="h-3 w-3" />{t('vanSales.smartNext.seq', { n: c.sequence })}</Badge>
              {c.overdue && <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />{t('vanSales.smartNext.overdue')}</Badge>}
              {c.creditWarning && <Badge variant="warning" className="gap-1"><CreditCard className="h-3 w-3" />{t('vanSales.smartNext.creditWarn')}</Badge>}
            </div>
          </div>
          <div className="shrink-0 text-end">
            <div className="text-lg font-bold tabular-nums" dir="ltr">{formatDistance(c.distanceM, locale)}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <PendingLink href={startHref} onClick={() => setActiveVisit(c.customerId, name)} pendingLabel={t('common.starting')} className={buttonVariants({ size: 'sm' })}>
            <Play className="h-4 w-4" /> {t('vanSales.smartNext.startVisit')}
          </PendingLink>
          <NavigateButton lat={c.latitude} lng={c.longitude} />
        </div>
      </CardContent>
    </Card>
  );
}
