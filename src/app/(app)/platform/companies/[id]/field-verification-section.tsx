'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';

/**
 * Company 360 — Field Customer Verification section (READ-ONLY).
 *
 * Presents Field Verification as a first-class module surface: enablement +
 * a lightweight module-health readout (customers / assigned / verified / pending,
 * outside-radius attempts, last activity). Read-only — nothing here mutates.
 */
export function FieldVerificationSection({
  enabled,
  totalCustomers,
  assignedCustomers,
  verifiedCustomers,
  pendingCustomers,
  outsideRadiusAttempts,
  lastActivity,
}: {
  enabled: boolean;
  totalCustomers: number | null;
  assignedCustomers: number | null;
  verifiedCustomers: number | null;
  pendingCustomers: number | null;
  outsideRadiusAttempts: number | null;
  lastActivity: string | null;
}) {
  const { t } = useI18n();

  const num = (v: number | null) => (v == null ? '—' : String(v));
  const lastActivityLabel = (() => {
    if (!lastActivity) return t('platform.company.c360.fvNever');
    const days = Math.max(0, Math.round((Date.now() - new Date(lastActivity).getTime()) / 86_400_000));
    return days === 0 ? t('platform.company.c360.fvToday') : t('platform.overview.daysAgo', { n: days });
  })();

  const stat = (label: string, value: string) => (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums" dir="ltr">{value}</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t('platform.company.c360.fvIntro')}</p>

      {/* Enablement */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('platform.company.c360.fvEnablement')}</p>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={enabled ? 'success' : 'secondary'}>
                {enabled ? t('platform.company.c360.fvEnabled') : t('platform.company.c360.fvDisabled')}
              </Badge>
              <span className="text-xs text-muted-foreground" dir="ltr">field_verification</span>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('platform.company.c360.fvLastActivity')}</p>
            <p className="mt-1 text-sm font-medium" dir="ltr">{lastActivityLabel}</p>
          </div>
        </CardContent>
      </Card>

      {/* Module health */}
      <Card>
        <CardContent className="p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">{t('platform.company.c360.fvHealth')}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {stat(t('platform.company.c360.fvTotalCustomers'), num(totalCustomers))}
            {stat(t('platform.company.c360.fvAssigned'), num(assignedCustomers))}
            {stat(t('platform.company.c360.fvVerified'), num(verifiedCustomers))}
            {stat(t('platform.company.c360.fvPending'), num(pendingCustomers))}
            {stat(t('platform.company.c360.fvOutsideRadius'), num(outsideRadiusAttempts))}
            {stat(t('platform.company.c360.fvModuleState'), enabled ? t('platform.company.c360.fvEnabled') : t('platform.company.c360.fvDisabled'))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
