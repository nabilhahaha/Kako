'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import type { ResolvedSetting, ModuleSettingDef, SettingValue } from '@/lib/erp/module-settings-catalog';

/**
 * Company 360 — Route Planner section (READ-ONLY, Phase 1).
 *
 * Presents Route Planner as a first-class, sellable module surface using what
 * already exists on main: module enablement, subscription/trial/plan visibility,
 * a lightweight module-health readout (routes + journey plans), and the read-only
 * Route Planner settings from the module-settings catalog (the "route" group).
 * Nothing here mutates; the heavy Route Planner product (persistence, missions,
 * dashboards) is intentionally NOT included in this phase.
 */
export function RoutePlannerSection({
  enabled,
  planKey,
  subState,
  daysLeft,
  routeCount,
  journeyPlanCount,
  settings,
}: {
  enabled: boolean;
  planKey: string | null;
  subState: string;
  daysLeft: number | null;
  routeCount: number | null;
  journeyPlanCount: number | null;
  settings: ResolvedSetting[];
}) {
  const { t, locale } = useI18n();

  function renderValue(def: ModuleSettingDef, value: SettingValue) {
    if (def.type === 'boolean') {
      return (
        <Badge variant={value ? 'success' : 'secondary'}>
          {value ? t('platform.company.c360.wfOn') : t('platform.company.c360.wfOff')}
        </Badge>
      );
    }
    return <Badge variant="secondary" dir="ltr">{String(value)}</Badge>;
  }

  const stat = (label: string, value: string) => (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums" dir="ltr">{value}</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t('platform.company.c360.rpIntro')}</p>

      {/* Enablement + subscription */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('platform.company.c360.rpEnablement')}</p>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={enabled ? 'success' : 'secondary'}>
                {enabled ? t('platform.company.c360.rpEnabled') : t('platform.company.c360.rpDisabled')}
              </Badge>
              <span className="text-xs text-muted-foreground" dir="ltr">route_management</span>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('platform.company.c360.rpPlan')}</p>
            <div className="mt-1 flex items-center gap-2">
              {planKey
                ? <Badge variant="secondary" dir="ltr">{planKey}</Badge>
                : <span className="text-sm text-muted-foreground">{t('platform.company.c360.rpNoPlan')}</span>}
              <Badge variant="info">{t(`platform.state.${subState}`)}</Badge>
              {daysLeft != null && (
                <span className="text-xs text-muted-foreground" dir="ltr">
                  {daysLeft < 0
                    ? t('platform.overview.daysAgo', { n: Math.abs(daysLeft) })
                    : t('platform.overview.daysLeft', { n: daysLeft })}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Module health */}
      <Card>
        <CardContent className="p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">{t('platform.company.c360.rpHealth')}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {stat(t('platform.company.c360.rpRoutes'), routeCount == null ? '—' : String(routeCount))}
            {stat(t('platform.company.c360.rpJourneyPlans'), journeyPlanCount == null ? '—' : String(journeyPlanCount))}
            {stat(t('platform.company.c360.rpModuleState'), enabled ? t('platform.company.c360.rpEnabled') : t('platform.company.c360.rpDisabled'))}
          </div>
        </CardContent>
      </Card>

      {/* Read-only Route Planner settings (module-settings "route" group) */}
      <Card>
        <CardContent className="p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">{t('platform.company.c360.rpSettings')}</p>
          {settings.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('platform.company.c360.rpNoSettings')}</p>
          ) : (
            <div className="divide-y divide-border/60">
              {settings.map(({ def, value, source }) => (
                <div key={`${def.module}.${def.key}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <div className="min-w-[200px] flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{def.label[locale]}</span>
                      {def.risk === 'sensitive' && <Badge variant="warning">{t('platform.company.c360.wfSensitive')}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{def.help[locale]}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={source === 'company' ? 'info' : 'outline'}>
                      {source === 'company' ? t('platform.company.c360.wfCustom') : t('platform.company.c360.wfDefault')}
                    </Badge>
                    {renderValue(def, value)}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">{t('platform.company.c360.wfFoundation')}</p>
        </CardContent>
      </Card>

      {/* Admin link (subscription/tenant management lives in /planner-admin) */}
      <Link href="/planner-admin" className="inline-block text-xs text-primary hover:underline">
        {t('platform.company.c360.rpAdminLink')}
      </Link>
    </div>
  );
}
