'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Loader2, X, Building2, CheckCircle2, Ban } from 'lucide-react';
import { StatCard } from '@/components/shared/stat-card';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AdminWorkbench, useWorkbenchSelection } from '@/components/admin/admin-workbench';
import { EntityListPanel } from '@/components/admin/entity-list-panel';
import { DetailPlaceholder } from '@/components/admin/entity-detail';
import { Company360 } from './[id]/company-360';
import type { CompanyListRow } from './companies-workbench-server';
import type { CompanyDetailBundle } from './[id]/load';
import { createCompany, setCompanyPlan, setCompanyTrial, setCompanyActive } from './actions';
import { loadCompanyDetailBundleAction } from './companies-workbench-actions';
import { BUSINESS_TYPE_LABELS, BUSINESS_TYPES } from '@/lib/erp/subscription';

/** General company plans offered at creation (Route-Planner plans are provisioned from the
 *  Route Planner product, not the general workbench). */
const GENERAL_PLAN_KEYS = ['free', 'standard', 'pro', 'unlimited'] as const;

/**
 * Companies on the Admin Workbench — the PRIMARY company administration center.
 * Left = companies list + quick-create; center = the full existing Company360
 * detail (Profile/Subscription/Users/Roles/Permissions/Modules/Packs/Integrations/
 * Audit) for the selected company, reused verbatim. No business-logic / permission
 * / RLS / workflow change. The /platform/companies/[id] route redirects here.
 */
export function CompaniesWorkbench({ companies }: { companies: CompanyListRow[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const { selectedId, tab, select } = useWorkbenchSelection('summary');
  const [bundle, setBundle] = useState<CompanyDetailBundle | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedId) { setBundle(null); return; }
    setLoading(true);
    loadCompanyDetailBundleAction(selectedId).then((res) => {
      setBundle(res.ok ? res.data : null);
      setLoading(false);
      if (!res.ok) toast.error(t('platform.company.toastError'));
    });
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const plan = String(fd.get('plan') || '');
    const trialDays = Number(fd.get('trial_days') || 0);
    const status = String(fd.get('status') || 'active');
    start(async () => {
      const res = await createCompany(fd);
      if (!res.ok) { toast.error(res.error ?? t('platform.company.toastError')); return; }
      const id = res.data!.id;
      // Apply plan / trial / status through the canonical actions (best-effort: the company
      // exists either way; surface a warning if an enrichment step is rejected).
      const steps: Promise<{ ok: boolean }>[] = [];
      if (plan && plan !== 'standard') steps.push(setCompanyPlan(id, plan));
      if (trialDays > 0) steps.push(setCompanyTrial(id, trialDays));
      if (status === 'suspended') steps.push(setCompanyActive(id, false));
      const failed = (await Promise.all(steps)).filter((r) => !r.ok).length;
      toast.success(t('platform.companies.toastCreated'));
      if (failed > 0) toast.warning(t('platform.companies.toastCreatedPartial'));
      setAdding(false);
      router.refresh();
    });
  }

  const list = (
    <EntityListPanel
      items={companies.map((c) => ({
        id: c.id,
        primary: c.name_ar || c.name,
        secondary: [c.plan_key, c.is_active ? t('platform.companies.create.statusActive') : t('platform.companies.create.statusSuspended')]
          .filter(Boolean).join(' · '),
        search: c.name,
      }))}
      selectedId={selectedId}
      onSelect={select}
      searchPlaceholder={t('platform.companies.title')}
      quickCreate={
        !adding ? (
          <Button size="sm" className="w-full" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('platform.companies.newCompany')}</Button>
        ) : (
          <form onSubmit={onCreate} className="flex max-h-[70vh] flex-col overflow-hidden rounded-md border">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-xs font-semibold">{t('platform.companies.newCompany')}</span>
              <button type="button" onClick={() => setAdding(false)} className="rounded p-0.5 hover:bg-secondary"><X className="h-3.5 w-3.5" /></button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-3">
              {/* Identity */}
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('platform.companies.create.sectionIdentity')}</p>
                <Input name="name" placeholder={t('platform.company.info.nameLabel')} required />
                <Input name="name_ar" placeholder={t('platform.company.info.nameArLabel')} />
                <Input name="slug" placeholder="slug" dir="ltr" />
                <label className="block text-xs text-muted-foreground">{t('platform.companies.create.businessType')}
                  <select name="business_type" defaultValue="general" className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm">
                    {BUSINESS_TYPES.map((bt) => (
                      <option key={bt} value={bt}>{BUSINESS_TYPE_LABELS[bt][locale === 'ar' ? 'ar' : 'en']}</option>
                    ))}
                  </select>
                </label>
              </div>
              {/* Location */}
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('platform.companies.create.sectionLocation')}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input name="country" placeholder={t('platform.companies.create.country')} />
                  <Input name="city" placeholder={t('platform.companies.create.city')} />
                </div>
              </div>
              {/* Plan & trial */}
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('platform.companies.create.sectionPlan')}</p>
                <label className="block text-xs text-muted-foreground">{t('platform.companies.create.plan')}
                  <select name="plan" defaultValue="standard" className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm">
                    {GENERAL_PLAN_KEYS.map((p) => (
                      <option key={p} value={p}>{t(`platform.companies.create.plan_${p}`)}</option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs text-muted-foreground">{t('platform.companies.create.trialStart')}
                    <Input name="trial_start" type="date" dir="ltr" className="mt-1" />
                  </label>
                  <label className="block text-xs text-muted-foreground">{t('platform.companies.create.trialDays')}
                    <Input name="trial_days" type="number" min="0" dir="ltr" placeholder="0" className="mt-1" />
                  </label>
                </div>
                <label className="block text-xs text-muted-foreground">{t('platform.companies.create.subscriptionEnd')}
                  <Input name="subscription_end" type="date" dir="ltr" className="mt-1" />
                </label>
              </div>
              {/* Status */}
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('platform.companies.create.sectionStatus')}</p>
                <label className="block text-xs text-muted-foreground">{t('platform.companies.create.status')}
                  <select name="status" defaultValue="active" className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm">
                    <option value="active">{t('platform.companies.create.statusActive')}</option>
                    <option value="suspended">{t('platform.companies.create.statusSuspended')}</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="is_pilot" className="h-4 w-4" /> {t('platform.companies.create.pilot')}
                </label>
              </div>
            </div>
            {/* Sticky footer — Save always reachable */}
            <div className="sticky bottom-0 border-t bg-card p-2">
              <Button type="submit" size="sm" className="w-full" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}{t('platform.companies.create.submit')}</Button>
            </div>
          </form>
        )
      }
    />
  );

  const detail = !selectedId ? (
    <DetailPlaceholder text={t('adminWb.companyPrompt')} />
  ) : loading || !bundle ? (
    <DetailPlaceholder text="…" />
  ) : (
    <Company360 initialSection={tab} {...bundle} />
  );

  // KPI strip from already-loaded rows (no extra fetch / no schema change).
  const total = companies.length;
  const active = companies.filter((c) => c.is_active).length;
  const suspended = total - active;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-bold">{t('platform.companies.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('platform.companies.subtitle')}</p>
      </header>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label={t('platform.companies.kpiTotal')} value={String(total)} icon={Building2} tone="primary" />
        <StatCard label={t('platform.companies.kpiActive')} value={String(active)} icon={CheckCircle2} tone="success" />
        <StatCard label={t('platform.companies.kpiSuspended')} value={String(suspended)} icon={Ban} tone={suspended > 0 ? 'warning' : 'primary'} />
      </div>
      <AdminWorkbench list={list} detail={detail} />
    </div>
  );
}
