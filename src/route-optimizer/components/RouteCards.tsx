import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Clock, TrendingUp, AlertTriangle, Navigation, Copy, Check } from 'lucide-react';
import type { RouteResult } from '../types';

interface RouteCardsProps {
  routes: RouteResult[];
  outstationRoutes: RouteResult[];
}

const DAY_KEYS = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] as const;

export function RouteCards({ routes, outstationRoutes }: RouteCardsProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <h2 className="text-h2 font-semibold">{t('routeCards.title')}</h2>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {routes.map((route, i) => (
          <RouteCard key={`r-${i}`} route={route} index={i} type="normal" t={t} />
        ))}
        {outstationRoutes.map((route, i) => (
          <RouteCard key={`o-${i}`} route={route} index={i} type="outstation" t={t} />
        ))}
      </div>
    </div>
  );
}

function RouteCard({
  route,
  index,
  type,
  t,
}: {
  route: RouteResult;
  index: number;
  type: 'normal' | 'outstation';
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const hasWarnings = route.warnings.length > 0;
  const [copied, setCopied] = useState(false);

  const dailyMapsLinks = route.dailyPlans
    .filter((dp) => dp.googleMapsUrl)
    .map((dp) => {
      const dayName = t('print.days.' + (DAY_KEYS[dp.dayIndex] ?? `day${dp.dayIndex}`));
      return `${dayName}: ${dp.googleMapsUrl}`;
    });

  const handleCopyAllLinks = async () => {
    if (dailyMapsLinks.length === 0) return;
    try {
      await navigator.clipboard.writeText(dailyMapsLinks.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: ignore
    }
  };

  return (
    <div
      className="rounded-xl border bg-card p-4 shadow-sm"
      style={{ borderLeftWidth: 4, borderLeftColor: route.color }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-h3 font-semibold">
            {type === 'outstation' ? t('routeCards.outstationLabel') : t('routeCards.routeNumber', { number: index + 1 })}
          </h3>
          {type === 'outstation' && (
            <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning">
              {t('routeCards.outstationLabel')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {dailyMapsLinks.length > 0 && (
            <button
              type="button"
              onClick={handleCopyAllLinks}
              className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? t('common.success') : 'Copy Maps Links'}
            </button>
          )}
          {hasWarnings && <AlertTriangle className="h-4 w-4 text-warning" />}
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-muted/50 p-2 text-center">
          <MapPin className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
          <p className="text-lg font-bold">{route.totalCustomers}</p>
          <p className="text-xs text-muted-foreground">{t('map.customers')}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-2 text-center">
          <TrendingUp className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
          <p className="text-lg font-bold">{route.weeklyKm.toFixed(0)}</p>
          <p className="text-xs text-muted-foreground">{t('routeCards.weeklyKm')}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-2 text-center">
          <Clock className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
          <p className="text-lg font-bold">{route.avgDailyHours.toFixed(1)}</p>
          <p className="text-xs text-muted-foreground">{t('routeCards.avgDailyHours')}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-2 text-center">
          <TrendingUp className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
          <p className="text-lg font-bold">{(route.sellingTimeRatio * 100).toFixed(0)}%</p>
          <p className="text-xs text-muted-foreground">{t('routeCards.sellingTimeRatio')}</p>
        </div>
      </div>

      {route.dailyPlans.length > 0 && (
        <div className="space-y-1">
          {route.dailyPlans.map((dp) => (
            <div key={dp.dayIndex} className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-1.5 text-xs">
              <span className="font-medium">{t('print.days.' + (DAY_KEYS[dp.dayIndex] ?? `day${dp.dayIndex}`))}</span>
              <div className="flex items-center gap-3 text-muted-foreground">
                <span>{dp.sequencedCustomers.length} {t('map.customers')}</span>
                <span>{dp.distanceKm.toFixed(1)} {t('common.km')}</span>
                <span>{dp.totalHours.toFixed(1)} {t('common.hours')}</span>
                {dp.googleMapsUrl && (
                  <a
                    href={dp.googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/80"
                  >
                    <Navigation className="h-3 w-3" />
                    Maps
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {hasWarnings && (
        <div className="mt-3 space-y-1">
          {route.warnings.map((w, wi) => (
            <p key={wi} className="text-xs text-warning">
              <AlertTriangle className="me-1 inline-block h-3 w-3" />
              {w}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
