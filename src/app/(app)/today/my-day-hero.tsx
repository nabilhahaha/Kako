'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/provider';
import { rankNextCustomers, isEligible, formatDistance, type NextCandidate, type GpsPoint } from '@/lib/van-sales/next-customer';
import { getActiveVisit, setActiveVisit, type ActiveVisit } from '@/lib/van-sales/active-visit';
import { logFieldUxEvent } from '@/lib/van-sales/ux-metrics-server';
import { NavigateButton } from '@/components/field/navigate-button';
import { RotateCcw, Play, CheckCircle2, AlertTriangle, CreditCard, Route } from 'lucide-react';

// My Day hero — classic SFA / SalesBuzz field flow: ONE clear next action,
// route-first, no dashboard noise. Open-day only; the workspace handles
// not-started / closed. Three states:
//   A) active visit   → Resume current visit (+ small View route).
//   B) remaining stops → Next Customer card (name · distance · stop · flags) with
//                        Start Visit + Navigate (+ small View route).
//   C) route completed → Route completed + visited/planned + End Day & Settle.
// Active visit + GPS are client-side; SSR/first paint renders B/C (active=null,
// no GPS) then upgrades on mount (no hydration mismatch).
export function MyDayHero({ candidates, visited, planned }: { candidates: NextCandidate[]; visited: number; planned: number }) {
  const { t, locale } = useI18n();
  const [active, setActive] = useState<ActiveVisit | null>(null);
  const [origin, setOrigin] = useState<GpsPoint | null>(null);

  useEffect(() => {
    const av = getActiveVisit();
    setActive(av);
    if (av) void logFieldUxEvent({ eventType: 'resume_shown', customerId: av.customerId });
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setOrigin({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => {},
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
      );
    }
  }, []);

  const eligible = useMemo(() => candidates.filter(isEligible), [candidates]);
  const top = useMemo(() => rankNextCustomers(candidates, origin, { limit: 1 })[0] ?? null, [candidates, origin]);

  // ── STATE A — active visit ──
  if (active) {
    return (
      <Card className="border-primary/50 bg-primary/5">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <RotateCcw className="h-4 w-4 text-primary" /> {t('vanSales.smartNext.resumeTitle')}
          </div>
          <p className="truncate text-2xl font-bold">{active.name || '—'}</p>
          <Link
            href={`/field/van-sales/statement/${active.customerId}?from=route&src=resume`}
            onClick={() => void logFieldUxEvent({ eventType: 'resume_clicked', customerId: active.customerId })}
            className={`w-full ${buttonVariants({ size: 'lg' })}`}
          >
            <Play className="h-5 w-5 rtl:rotate-180" /> {t('vanSales.smartNext.resume')}
          </Link>
          <Link href="/field/journey" className="block text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
            {t('vanSales.smartNext.viewRoute')}
          </Link>
        </CardContent>
      </Card>
    );
  }

  // ── STATE C — route completed ──
  if (eligible.length === 0 || !top) {
    return (
      <Card className="border-success/40">
        <CardContent className="space-y-3 p-5 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
          <div>
            <p className="text-lg font-bold">{t('vanSales.smartNext.routeDone')}</p>
            <p className="text-sm text-muted-foreground">{t('vanSales.smartNext.coverageLine', { visited, planned })}</p>
          </div>
          <Link href="/field/journey?endday=1" className={`w-full ${buttonVariants({ size: 'lg' })}`}>
            <CheckCircle2 className="h-5 w-5" /> {t('vanSales.endDaySettle')}
          </Link>
        </CardContent>
      </Card>
    );
  }

  // ── STATE B — next customer (route-first ranked) ──
  const c = top;
  const name = (locale === 'ar' && c.nameAr) ? c.nameAr : c.name;
  const startHref = `/field/van-sales/statement/${c.customerId}?from=route&seq=${c.sequence}&total=${planned}&src=smart_next`;
  return (
    <Card className="border-primary/50">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('vanSales.smartNext.nextTitle')}</span>
          <Badge variant="secondary" className="gap-1"><Route className="h-3 w-3" />{t('vanSales.smartNext.seq', { n: c.sequence })}</Badge>
        </div>
        <div className="flex items-start justify-between gap-3">
          <p className="text-2xl font-bold leading-tight">{name}</p>
          <span className="shrink-0 pt-1 text-lg font-bold tabular-nums" dir="ltr">{formatDistance(c.distanceM, locale)}</span>
        </div>
        {(c.overdue || c.creditWarning) && (
          <div className="flex flex-wrap gap-1.5">
            {c.overdue && <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />{t('vanSales.smartNext.overdue')}</Badge>}
            {c.creditWarning && <Badge variant="warning" className="gap-1"><CreditCard className="h-3 w-3" />{t('vanSales.smartNext.creditWarn')}</Badge>}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Link href={startHref} onClick={() => setActiveVisit(c.customerId, name)} className={buttonVariants({ size: 'lg' })}>
            <Play className="h-5 w-5 rtl:rotate-180" /> {t('vanSales.smartNext.startVisit')}
          </Link>
          <NavigateButton lat={c.latitude} lng={c.longitude} size="lg" />
        </div>
        <Link href="/field/journey" className="block text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
          {t('vanSales.smartNext.viewRoute')}
        </Link>
      </CardContent>
    </Card>
  );
}
