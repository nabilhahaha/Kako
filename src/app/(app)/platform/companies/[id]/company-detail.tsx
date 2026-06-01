'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, CalendarPlus, Power, Save, Gauge, KeyRound, Hourglass, Plug, Boxes, Rocket, RotateCcw, CheckCircle2 } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import type { Branch, Company } from '@/lib/erp/types';
import type { Plan, CompanyUsage } from '@/lib/erp/plans';
import { BRANCH_ROLES } from '@/lib/erp/constants';
import { ALL_MODULES, MODULE_LABELS, type Module } from '@/lib/erp/navigation';
import { classifyModuleKey } from '@/lib/erp/licensing-catalog';
import { usePrompt } from '@/components/prompt-dialog';
import {
  BUSINESS_TYPE_LABELS,
  BUSINESS_TYPES,
  daysLeft,
  trialDaysLeft,
  subscriptionState,
} from '@/lib/erp/subscription';
import {
  updateCompany,
  setCompanyActive,
  setSubscriptionEnd,
  setCompanyPlan,
  setCompanyModule,
  setCompanySelfUsers,
  setCompanyTrial,
  setIntegrationActive,
  setCompanySetupDone,
  resetUserPassword,
  addBranch,
  onboardAdmin,
} from '../actions';
import type { CompanyTabKey } from './company-tabs';
import { useI18n } from '@/lib/i18n/provider';

export interface MemberRow {
  userId: string;
  branchId: string;
  branchName: string;
  role: string;
  isDefault: boolean;
  fullName: string | null;
  email: string | null;
}

export interface IntegrationRow {
  id: string;
  name: string;
  kind: string;
  direction: string;
  adapter: string;
  is_active: boolean;
}

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  is_active: boolean;
}

const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const STATE_BADGE_VARIANT = {
  active:    'success' as const,
  expiring:  'warning' as const,
  expired:   'destructive' as const,
  suspended: 'destructive' as const,
  trial:     'info' as const,
  open:      'info' as const,
};

function addMonths(base: Date, months: number): string {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function CompanyDetail({
  tab,
  company,
  branches,
  members,
  companyRoles,
  plans,
  usage,
  modulesByPlan,
  enabledModules = [],
  integrations = [],
  apiKeys = [],
}: {
  /** Which tab's content to render. */
  tab: CompanyTabKey;
  company: Company;
  branches: Branch[];
  members: MemberRow[];
  /** Roles enabled for this company (key + Arabic label); used for onboarding. */
  companyRoles?: { key: string; name_ar: string }[];
  /** Available subscription plans (for the plan selector). */
  plans?: Plan[];
  /** Current usage tallies for this company. */
  usage?: CompanyUsage;
  /** Modules unlocked per plan key (for display under the plan). */
  modulesByPlan?: Record<string, string[]>;
  /** Modules currently enabled for this company (overrides the type default). */
  enabledModules?: string[];
  /** Per-company integration connections (for the Integrations tab). */
  integrations?: IntegrationRow[];
  /** Per-company API keys (read-only, for the Integrations tab). */
  apiKeys?: ApiKeyRow[];
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const prompt = usePrompt();
  const [pending, startTransition] = useTransition();
  const [customEnd, setCustomEnd] = useState('');
  const [modules, setModules] = useState<Set<string>>(new Set(enabledModules));

  function toggleModule(m: Module, on: boolean) {
    setModules((prev) => {
      const next = new Set(prev);
      if (on) next.add(m); else next.delete(m);
      return next;
    });
    startTransition(async () => {
      const res = await setCompanyModule(company.id, m, on);
      if (!res.ok) toast.error(res.error ?? t('platform.company.toastError'));
      router.refresh();
    });
  }

  function toggleIntegration(integrationId: string, on: boolean) {
    startTransition(async () => {
      const res = await setIntegrationActive(company.id, integrationId, on);
      if (!res.ok) toast.error(res.error ?? t('platform.company.toastError'));
      router.refresh();
    });
  }

  function resetPassword(userId: string, label: string | null) {
    prompt({
      title: t('platform.company.members.resetPasswordTitle'),
      message: t('platform.company.members.resetPasswordMessage', { name: label ?? userId }),
      label: t('platform.company.members.resetPasswordLabel'),
      type: 'password',
      confirmText: t('platform.company.members.resetPasswordConfirm'),
    }).then((pwd) => {
      if (pwd == null) return;
      if (pwd.length < 6) { toast.error(t('platform.company.members.toastPasswordTooShort')); return; }
      startTransition(async () => {
        const res = await resetUserPassword(userId, pwd);
        if (!res.ok) { toast.error(res.error ?? t('platform.company.toastError')); return; }
        toast.success(t('platform.company.members.toastPasswordChanged'));
      });
    });
  }

  const state = subscriptionState(company);
  const left = daysLeft(company);
  const trialLeft = trialDaysLeft(company);
  const badgeVariant = STATE_BADGE_VARIANT[state];
  const stateLabel = t(`platform.state.${state}`);

  const coreModules = ALL_MODULES.filter((m) => classifyModuleKey(m) === 'core' && m !== 'integrations');
  const packModules = ALL_MODULES.filter((m) => classifyModuleKey(m) === 'pack');
  const integrationsOn = modules.has('integrations');

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? t('platform.company.toastError'));
        return;
      }
      toast.success(okMsg);
      router.refresh();
    });
  }

  function renewBy(months: number) {
    const anchor =
      company.subscription_end && new Date(company.subscription_end) > new Date()
        ? new Date(company.subscription_end)
        : new Date();
    run(() => setSubscriptionEnd(company.id, addMonths(anchor, months)), t('platform.company.subscription.toastRenewed'));
  }

  function onSubmit(
    e: React.FormEvent<HTMLFormElement>,
    fn: (fd: FormData) => Promise<{ ok: boolean; error?: string }>,
    okMsg: string,
    reset = false,
  ) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      const res = await fn(fd);
      if (!res.ok) {
        toast.error(res.error ?? t('platform.company.toastError'));
        return;
      }
      toast.success(okMsg);
      if (reset) form.reset();
      router.refresh();
    });
  }

  // Onboarding role options: the roles enabled for this company (incl. custom
  // ones). Falls back to the full built-in set when no company config is passed.
  const roleOptions =
    companyRoles && companyRoles.length > 0
      ? companyRoles
      : (Object.keys(BRANCH_ROLES) as (keyof typeof BRANCH_ROLES)[]).map((key) => ({
          key,
          name_ar: BRANCH_ROLES[key].ar,
        }));

  return (
    <div className="space-y-6">
      {/* ── Overview ───────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={badgeVariant}>{stateLabel}</Badge>
              {company.plan_key && <Badge variant="secondary" dir="ltr">{company.plan_key}</Badge>}
              {company.business_type && (
                <span className="text-sm text-muted-foreground">{BUSINESS_TYPE_LABELS[company.business_type][locale]}</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: t('platform.company.overview.users'), value: usage ? usage.users : members.length },
                { label: t('platform.company.overview.branches'), value: usage ? usage.branches : branches.length },
                { label: t('platform.company.overview.products'), value: usage ? usage.products : 0 },
                { label: t('platform.company.overview.modules'), value: modules.size },
              ].map((it) => (
                <div key={it.label} className="rounded-md border p-3 text-center">
                  <p className="text-xs text-muted-foreground">{it.label}</p>
                  <p className="text-lg font-bold tabular-nums" dir="ltr">{it.value}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-2 border-t pt-3 text-sm sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{t('platform.company.overview.expiry')}:</span>
                <span dir="ltr">{company.subscription_end ?? '—'}{left !== null ? ` (${t('platform.company.subscription.daysRemaining', { n: left })})` : ''}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{t('platform.company.overview.trial')}:</span>
                <span dir="ltr">{trialLeft !== null && trialLeft >= 0 ? t('platform.company.trial.daysLeft', { n: trialLeft }) : t('platform.company.trial.none')}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t pt-3">
              <span className="flex items-center gap-2 text-sm">
                {company.setup_done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Rocket className="h-4 w-4 text-muted-foreground" />}
                {company.setup_done ? t('platform.company.overview.onboardingDone') : t('platform.company.overview.onboardingPending')}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => run(() => setCompanySetupDone(company.id, !company.setup_done), t('platform.company.overview.onboardingToast'))}
              >
                <RotateCcw className="h-4 w-4" />
                {company.setup_done ? t('platform.company.overview.resetOnboarding') : t('platform.company.overview.markOnboarded')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Subscription */}
      {tab === 'subscription' && (
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="font-semibold">{t('platform.company.subscription.title')}</span>
              <Badge variant={badgeVariant}>{stateLabel}</Badge>
              {company.subscription_end && (
                <span className="text-sm text-muted-foreground" dir="ltr">
                  {t('platform.company.subscription.expiresOn', { date: company.subscription_end })}
                  {left !== null && ` ${t('platform.company.subscription.daysRemaining', { n: left })}`}
                </span>
              )}
            </div>
            <Button
              variant={company.is_active ? 'outline' : 'default'}
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  () => setCompanyActive(company.id, !company.is_active),
                  company.is_active
                    ? t('platform.company.subscription.toastSuspended')
                    : t('platform.company.subscription.toastActivated'),
                )
              }
            >
              <Power className="h-4 w-4" />
              {company.is_active
                ? t('platform.company.subscription.suspendCompany')
                : t('platform.company.subscription.activateCompany')}
            </Button>
          </div>

          <label className="mt-4 flex items-center gap-2 border-t pt-4 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={company.allow_self_users}
              disabled={pending}
              onChange={(e) =>
                run(
                  () => setCompanySelfUsers(company.id, e.target.checked),
                  e.target.checked
                    ? t('platform.company.subscription.toastSelfUsersOn')
                    : t('platform.company.subscription.toastSelfUsersOff'),
                )
              }
            />
            {t('platform.company.subscription.selfUsersLabel')}
            <span className="text-xs text-muted-foreground">{t('platform.company.subscription.selfUsersHint')}</span>
          </label>

          <div className="flex flex-wrap items-end gap-2">
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => renewBy(1)}>
              <CalendarPlus className="h-4 w-4" /> {t('platform.company.subscription.renewOneMonth')}
            </Button>
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => renewBy(3)}>
              <CalendarPlus className="h-4 w-4" /> {t('platform.company.subscription.renewThreeMonths')}
            </Button>
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => renewBy(12)}>
              <CalendarPlus className="h-4 w-4" /> {t('platform.company.subscription.renewOneYear')}
            </Button>
            <div className="flex items-end gap-2">
              <Input
                type="date"
                dir="ltr"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-44"
              />
              <Button
                size="sm"
                disabled={pending || !customEnd}
                onClick={() =>
                  customEnd &&
                  run(
                    () => setSubscriptionEnd(company.id, customEnd),
                    t('platform.company.subscription.toastEndUpdated'),
                  )
                }
              >
                {t('platform.company.subscription.applyDate')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Trial */}
      {tab === 'subscription' && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <h3 className="flex items-center gap-2 font-semibold">
              <Hourglass className="h-4 w-4" /> {t('platform.company.trial.title')}
            </h3>
            <p className="text-xs text-muted-foreground">{t('platform.company.trial.hint')}</p>
            <p className="text-sm">
              {trialLeft !== null && trialLeft >= 0
                ? t('platform.company.trial.activeUntil', { date: company.trial_ends_at ?? '', n: trialLeft })
                : t('platform.company.trial.none')}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => setCompanyTrial(company.id, 14), t('platform.company.trial.toastStarted'))}>
                <Hourglass className="h-4 w-4" /> {t('platform.company.trial.start14')}
              </Button>
              <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => setCompanyTrial(company.id, 30), t('platform.company.trial.toastStarted'))}>
                <Hourglass className="h-4 w-4" /> {t('platform.company.trial.start30')}
              </Button>
              {trialLeft !== null && (
                <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => setCompanyTrial(company.id, 0), t('platform.company.trial.toastEnded'))}>
                  {t('platform.company.trial.end')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan & limits */}
      {tab === 'subscription' && plans && plans.length > 0 && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 font-semibold">
                <Gauge className="h-4 w-4" /> {t('platform.company.plan.title')}
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{t('platform.company.plan.planLabel')}</span>
                <select
                  className={selectCls + ' w-44'}
                  value={company.plan_key ?? ''}
                  disabled={pending}
                  onChange={(e) =>
                    run(
                      () => setCompanyPlan(company.id, e.target.value),
                      t('platform.company.plan.toastUpdated'),
                    )
                  }
                >
                  {plans.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name_ar}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {usage && (() => {
              const plan = plans.find((p) => p.key === company.plan_key) ?? null;
              const fmt = (n: number, max: number | null | undefined) =>
                max == null ? `${n} / ∞` : `${n} / ${max}`;
              const over = (n: number, max: number | null | undefined) => max != null && n >= max;
              const items: { label: string; used: number; max: number | null | undefined }[] = [
                { label: t('platform.company.plan.metricUsers'), used: usage.users, max: plan?.max_users },
                { label: t('platform.company.plan.metricBranches'), used: usage.branches, max: plan?.max_branches },
                { label: t('platform.company.plan.metricProducts'), used: usage.products, max: plan?.max_products },
              ];
              return (
                <div className="grid grid-cols-3 gap-3">
                  {items.map((it) => (
                    <div key={it.label} className="rounded-md border p-3 text-center">
                      <p className="text-xs text-muted-foreground">{it.label}</p>
                      <p className={`text-lg font-bold tabular-nums ${over(it.used, it.max) ? 'text-destructive' : ''}`} dir="ltr">
                        {fmt(it.used, it.max)}
                      </p>
                    </div>
                  ))}
                </div>
              );
            })()}
            {modulesByPlan && company.plan_key && (
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <span className="text-xs text-muted-foreground">{t('platform.company.plan.availableModules')}</span>
                {(modulesByPlan[company.plan_key] ?? []).map((m) => (
                  <Badge key={m} variant="secondary">
                    {MODULE_LABELS[m as Module]?.[locale] ?? m}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Modules — core capability sections this company sees (default by
          business type; editable here, still capped by the plan's modules). */}
      {tab === 'modules' && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div>
              <h3 className="font-semibold">{t('platform.company.modules.title')}</h3>
              <p className="text-xs text-muted-foreground">{t('platform.company.modules.hint')}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {coreModules.map((m) => (
                <label key={m} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-primary" checked={modules.has(m)} disabled={pending} onChange={(e) => toggleModule(m, e.target.checked)} />
                  {MODULE_LABELS[m][locale]}
                </label>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Industry Packs — vertical modules, grouped from the same entitlements. */}
      {tab === 'packs' && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div>
              <h3 className="flex items-center gap-2 font-semibold"><Boxes className="h-4 w-4" /> {t('platform.company.packs.title')}</h3>
              <p className="text-xs text-muted-foreground">{t('platform.company.packs.hint')}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {packModules.map((m) => (
                <label key={m} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-primary" checked={modules.has(m)} disabled={pending} onChange={(e) => toggleModule(m, e.target.checked)} />
                  {MODULE_LABELS[m][locale]}
                </label>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Integrations — owner module toggle + per-connection enable/disable. */}
      {tab === 'integrations' && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 font-semibold"><Plug className="h-4 w-4" /> {t('platform.company.integrations.title')}</h3>
                <p className="text-xs text-muted-foreground">{t('platform.company.integrations.hint')}</p>
              </div>
              <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={integrationsOn} disabled={pending} onChange={(e) => toggleModule('integrations', e.target.checked)} />
                {t('platform.company.integrations.moduleLabel')}
              </label>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">{t('platform.company.integrations.connectionsTitle')}</p>
              {integrations.length === 0 ? (
                <EmptyState className="border-0" icon={<Plug />} title={t('platform.company.integrations.noConnections')} />
              ) : (
                <div className="divide-y rounded-md border">
                  {integrations.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium">{c.name}</span>
                        <span className="mx-1 text-muted-foreground">·</span>
                        <span className="text-muted-foreground" dir="ltr">{c.adapter} / {c.kind} / {c.direction}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant={c.is_active ? 'success' : 'secondary'}>{c.is_active ? t('platform.company.integrations.active') : t('platform.company.integrations.inactive')}</Badge>
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => toggleIntegration(c.id, !c.is_active)}>
                          <Power className="h-3.5 w-3.5" /> {c.is_active ? t('platform.company.integrations.disable') : t('platform.company.integrations.enable')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">{t('platform.company.integrations.apiKeysTitle')}</p>
              {apiKeys.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('platform.company.integrations.noApiKeys')}</p>
              ) : (
                <div className="divide-y rounded-md border">
                  {apiKeys.map((k) => (
                    <div key={k.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                      <span className="font-medium">{k.name} <span className="text-muted-foreground" dir="ltr">({k.prefix}…)</span></span>
                      <Badge variant={k.is_active ? 'success' : 'secondary'}>{k.is_active ? t('platform.company.integrations.active') : t('platform.company.integrations.inactive')}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Company info */}
      {tab === 'subscription' && (
      <Card>
        <CardContent className="pt-6">
          <form
            onSubmit={(e) => onSubmit(e, updateCompany, t('platform.company.info.toastSaved'))}
            className="space-y-4"
          >
            <input type="hidden" name="id" value={company.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name_ar">{t('platform.company.info.nameArLabel')}</Label>
                <Input id="name_ar" name="name_ar" defaultValue={company.name_ar ?? ''} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">{t('platform.company.info.nameLabel')}</Label>
                <Input id="name" name="name" required defaultValue={company.name} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="business_type">{t('platform.company.info.businessTypeLabel')}</Label>
                <select
                  id="business_type"
                  name="business_type"
                  className={selectCls}
                  defaultValue={company.business_type ?? 'general'}
                >
                  {BUSINESS_TYPES.map((bt) => (
                    <option key={bt} value={bt}>
                      {BUSINESS_TYPE_LABELS[bt][locale]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="subscription_start">{t('platform.company.info.subscriptionStartLabel')}</Label>
                  <Input
                    id="subscription_start"
                    name="subscription_start"
                    type="date"
                    dir="ltr"
                    defaultValue={company.subscription_start ?? ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subscription_end">{t('platform.company.info.subscriptionEndLabel')}</Label>
                  <Input
                    id="subscription_end"
                    name="subscription_end"
                    type="date"
                    dir="ltr"
                    defaultValue={company.subscription_end ?? ''}
                  />
                </div>
              </div>
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t('platform.company.info.saveButton')}
            </Button>
          </form>
        </CardContent>
      </Card>
      )}

      {/* Branches */}
      {tab === 'users' && (
      <Card>
        <CardContent className="space-y-4 pt-6">
          <h3 className="font-semibold">{t('platform.company.branches.title', { count: String(branches.length) })}</h3>
          {branches.length > 0 && (
            <div className="divide-y rounded-md border">
              {branches.map((b) => (
                <div key={b.id} className="flex items-center justify-between p-3 text-sm">
                  <span className="font-medium">
                    {b.name_ar || b.name}{' '}
                    <span className="text-muted-foreground" dir="ltr">
                      ({b.code})
                    </span>
                  </span>
                  {b.is_hq && <Badge variant="secondary">{t('platform.company.branches.badgeHq')}</Badge>}
                </div>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => onSubmit(e, addBranch, t('platform.company.branches.toastAdded'), true)}
            className="grid gap-3 sm:grid-cols-4"
          >
            <input type="hidden" name="company_id" value={company.id} />
            <Input name="code" placeholder={t('platform.company.branches.codePlaceholder')} dir="ltr" required />
            <Input name="name" placeholder={t('platform.company.branches.namePlaceholder')} required />
            <Input name="name_ar" placeholder={t('platform.company.branches.nameArPlaceholder')} />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" name="is_hq" /> {t('platform.company.branches.isHqLabel')}
              </label>
              <Button type="submit" size="sm" disabled={pending}>
                <Plus className="h-4 w-4" /> {t('platform.company.branches.addButton')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      )}

      {/* Users */}
      {tab === 'users' && (
      <Card>
        <CardContent className="space-y-4 pt-6">
          <h3 className="font-semibold">{t('platform.company.members.title', { count: String(members.length) })}</h3>
          {members.length > 0 && (
            <div className="divide-y rounded-md border">
              {members.map((m) => (
                <div key={`${m.userId}-${m.branchId}`} className="flex items-center justify-between gap-2 p-3 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">{m.fullName || m.email || m.userId.slice(0, 8)}</span>
                    <span className="mx-1 text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{m.branchName}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="secondary">
                      {BRANCH_ROLES[m.role as keyof typeof BRANCH_ROLES]?.ar ?? m.role}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => resetPassword(m.userId, m.fullName || m.email)}
                    >
                      <KeyRound className="h-3.5 w-3.5" /> {t('platform.company.members.resetPasswordButton')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {branches.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('platform.company.members.addFirstBranch')}</p>
          ) : (
            <form
              onSubmit={(e) => onSubmit(e, onboardAdmin, t('platform.company.members.toastCreated'), true)}
              className="space-y-3"
            >
              <input type="hidden" name="company_id" value={company.id} />
              <p className="text-sm font-medium">{t('platform.company.members.newUserTitle')}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input name="full_name" placeholder={t('platform.company.members.fullNamePlaceholder')} />
                <Input name="email" type="email" placeholder={t('platform.company.members.emailPlaceholder')} dir="ltr" required />
                <Input name="password" type="password" placeholder={t('platform.company.members.passwordPlaceholder')} dir="ltr" required />
                <select name="branch_id" className={selectCls} required defaultValue="">
                  <option value="" disabled>
                    {t('platform.company.members.branchPlaceholder')}
                  </option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name_ar || b.name}
                    </option>
                  ))}
                </select>
                <select name="role" className={selectCls} defaultValue="admin">
                  {roleOptions.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.name_ar}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {t('platform.company.members.createUserButton')}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}
