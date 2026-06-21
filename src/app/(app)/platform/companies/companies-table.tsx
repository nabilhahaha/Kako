'use client';

import { Ban, CheckCircle2, Settings2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
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

/** Strong, scannable status pills (clearer than the muted badge variants). */
const STATE_PILL: Record<DerivedState, string> = {
  active: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
  trial: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
  expired: 'bg-red-100 text-red-700 ring-1 ring-red-200',
  suspended: 'bg-zinc-200 text-zinc-700 ring-1 ring-zinc-300',
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
      <table className="w-full min-w-[880px] text-sm">
        <thead className="border-b bg-secondary/50 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3 text-start font-semibold">{t('platform.companies.thCompany')}</th>
            <th className="px-4 py-3 text-start font-semibold">{t('platform.companies.thPlan')}</th>
            <th className="px-4 py-3 text-start font-semibold">{t('platform.companies.thStatus')}</th>
            <th className="px-4 py-3 text-end font-semibold">{t('platform.companies.thUsers')}</th>
            <th className="px-4 py-3 text-start font-semibold">{t('platform.companies.thSubscription')}</th>
            <th className="px-4 py-3 text-start font-semibold">{t('platform.companies.thActivity')}</th>
            <th className="px-4 py-3 text-end font-semibold">{t('platform.companies.thActions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((c) => {
            const state = deriveState(c);
            const name = c.name_ar || c.name;
            return (
              <tr key={c.id} className="hover:bg-secondary/30">
                <td className="px-4 py-3">
                  <button onClick={() => onManage(c.id)} className="flex items-center gap-2.5 text-start">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">
                      {name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="font-semibold text-foreground hover:underline">{name}</span>
                  </button>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{c.plan_key ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATE_PILL[state]}`}>
                    {t(`platform.state.${state}`)}
                  </span>
                </td>
                <td className="px-4 py-3 text-end font-medium tabular-nums" dir="ltr">{c.userCount}</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground" dir="ltr">{fmtDate(c.subscriptionEnd ?? c.trialEndsAt)}</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground" dir="ltr">{fmtDate(c.lastActivity)}</td>
                <td className="px-4 py-3">
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
