'use client';

import { Ban, CheckCircle2, Settings2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CompanyListRow } from './companies-workbench-server';

type DerivedState = 'active' | 'trial' | 'expired' | 'suspended';

/** Display-only status from the cached signals (no business logic — same fields the rest
 *  of the console reads). */
export function deriveState(c: CompanyListRow): DerivedState {
  if (!c.is_active) return 'suspended';
  const now = Date.now();
  if (c.trialEndsAt && new Date(c.trialEndsAt).getTime() >= now) return 'trial';
  if (c.subscriptionEnd && new Date(c.subscriptionEnd).getTime() < now) return 'expired';
  return 'active';
}

const STATE_BADGE: Record<DerivedState, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  trial: 'secondary',
  expired: 'destructive',
  suspended: 'outline',
};

function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

/** Desktop companies table — readable, aligned rows with the display-only columns. The
 *  initial tile + name lead; status/users/subscription/activity follow; an actions cell
 *  exposes Manage (opens Company 360) and a reuse of the existing activate/suspend action. */
export function CompaniesTable({
  rows,
  onManage,
  onToggleActive,
  pending,
}: {
  rows: CompanyListRow[];
  onManage: (id: string) => void;
  onToggleActive: (id: string, nextActive: boolean) => void;
  pending: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="border-b bg-secondary/40 text-xs text-muted-foreground">
          <tr className="text-start">
            <th className="px-4 py-2.5 text-start font-medium">{t('platform.companies.thCompany')}</th>
            <th className="px-4 py-2.5 text-start font-medium">{t('platform.companies.thPlan')}</th>
            <th className="px-4 py-2.5 text-start font-medium">{t('platform.companies.thStatus')}</th>
            <th className="px-4 py-2.5 text-start font-medium">{t('platform.companies.thUsers')}</th>
            <th className="px-4 py-2.5 text-start font-medium">{t('platform.companies.thSubscription')}</th>
            <th className="px-4 py-2.5 text-start font-medium">{t('platform.companies.thActivity')}</th>
            <th className="px-4 py-2.5 text-end font-medium">{t('platform.companies.thActions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((c) => {
            const state = deriveState(c);
            const name = c.name_ar || c.name;
            return (
              <tr key={c.id} className="hover:bg-secondary/30">
                <td className="px-4 py-2.5">
                  <button onClick={() => onManage(c.id)} className="flex items-center gap-2.5 text-start hover:underline">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                      {name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="font-medium">{name}</span>
                  </button>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{c.plan_key ?? '—'}</td>
                <td className="px-4 py-2.5">
                  <Badge variant={STATE_BADGE[state]}>{t(`platform.state.${state}`)}</Badge>
                </td>
                <td className="px-4 py-2.5 tabular-nums" dir="ltr">{c.userCount}</td>
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground" dir="ltr">{fmtDate(c.subscriptionEnd ?? c.trialEndsAt)}</td>
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground" dir="ltr">{fmtDate(c.lastActivity)}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => onManage(c.id)}>
                      <Settings2 className="h-3.5 w-3.5" /> {t('platform.companies.manage')}
                    </Button>
                    <Button
                      size="sm"
                      variant={c.is_active ? 'outline' : 'default'}
                      disabled={pending}
                      onClick={() => onToggleActive(c.id, !c.is_active)}
                      aria-label={c.is_active ? t('platform.companies.suspend') : t('platform.companies.activate')}
                      title={c.is_active ? t('platform.companies.suspend') : t('platform.companies.activate')}
                    >
                      {c.is_active ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
