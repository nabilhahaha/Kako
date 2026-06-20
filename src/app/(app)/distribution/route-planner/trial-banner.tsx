'use client';

import { CheckCircle2, AlertTriangle, Clock, XCircle } from 'lucide-react';
import { buildRenewWhatsAppUrl, type RoutePlannerSubscriptionView } from '@/lib/erp/route-planner-subscription';
import { WhatsAppContact } from '@/components/route-planner/whatsapp-contact';
import { useI18n } from '@/lib/i18n/provider';

/**
 * Trial / subscription banner for the Route Planner. Shows the live status (active
 * trial, winding-down warnings, expired / suspended) and a WhatsApp renewal CTA. Read-only
 * — pure presentation of the resolved subscription view.
 */
export function TrialBanner({ sub, compact = false }: { sub: RoutePlannerSubscriptionView; compact?: boolean }) {
  const { t } = useI18n();
  // A readable status line for the pre-filled WhatsApp message (status + days remaining).
  const statusLine = `${t(`routePlanner.adminStatus${sub.status[0].toUpperCase()}${sub.status.slice(1)}` as Parameters<typeof t>[0])}${sub.isActive && sub.daysRemaining > 0 ? ` · ${sub.daysRemaining}d` : ''}`;
  const renewUrl = buildRenewWhatsAppUrl(sub.companyName, sub.tenantId, statusLine);

  // Banner skin per warning level.
  const skin = {
    ok: { box: 'border-emerald-300 bg-emerald-50 text-emerald-800', Icon: CheckCircle2, dot: 'bg-emerald-500' },
    notice: { box: 'border-amber-300 bg-amber-50 text-amber-900', Icon: Clock, dot: 'bg-amber-500' },
    warn: { box: 'border-orange-300 bg-orange-50 text-orange-900', Icon: AlertTriangle, dot: 'bg-orange-500' },
    renew: { box: 'border-red-300 bg-red-50 text-red-800', Icon: AlertTriangle, dot: 'bg-red-500' },
    expired: { box: 'border-red-400 bg-red-50 text-red-800', Icon: XCircle, dot: 'bg-red-600' },
    suspended: { box: 'border-zinc-400 bg-zinc-100 text-zinc-700', Icon: XCircle, dot: 'bg-zinc-500' },
  }[sub.warning];

  const lapsed = sub.status === 'expired' || sub.status === 'suspended';

  // Headline + sub-text.
  const headline = lapsed
    ? (sub.status === 'suspended' ? t('routePlanner.subSuspended') : t('routePlanner.subExpired'))
    : sub.status === 'active'
      ? t('routePlanner.subActivePlan')
      : t('routePlanner.subTrialActive');

  const detail = lapsed
    ? t('routePlanner.subContactRenew')
    : sub.warning === 'renew'
      ? t('routePlanner.subRenewalRequired')
      : t('routePlanner.subDaysRemaining').replace('{n}', String(sub.daysRemaining));

  const renewBtn = <WhatsAppContact url={renewUrl} label={t('routePlanner.subRenewWhatsApp')} />;

  if (lapsed) {
    // Stronger, blocking-style notice — the action buttons are disabled alongside this.
    return (
      <div className={`flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2.5 ${skin.box}`}>
        <skin.Icon className="h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{headline}</p>
          <p className="text-xs opacity-90">{detail}</p>
        </div>
        {renewBtn}
      </div>
    );
  }

  return (
    <div className={`flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border ${compact ? 'px-3 py-1.5' : 'px-3 py-2'} ${skin.box}`}>
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
        <span className={`inline-block h-2 w-2 rounded-full ${skin.dot}`} />
        {headline}
      </span>
      <span className="text-xs font-medium tabular-nums">{detail}</span>
      <span className="ms-auto inline-flex items-center gap-2">
        {/* Any winding-down trial warning gets a direct WhatsApp action. */}
        {(sub.warning === 'notice' || sub.warning === 'warn' || sub.warning === 'renew') && renewBtn}
      </span>
    </div>
  );
}
