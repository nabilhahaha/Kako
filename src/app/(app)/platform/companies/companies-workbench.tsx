'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Loader2, X } from 'lucide-react';
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
      items={companies.map((c) => ({ id: c.id, primary: c.name_ar || c.name, secondary: c.plan_key ?? undefined, search: c.name }))}
      selectedId={selectedId}
      onSelect={select}
      searchPlaceholder={t('platform.companies.title')}
      quickCreate={
        !adding ? (
          <Button size="sm" className="w-full" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('platform.companies.newCompany')}</Button>
        ) : (
          <form onSubmit={onCreate} className="space-y-2 rounded-md border p-2">
            <div className="flex items-center justify-between"><span className="text-xs font-medium">{t('platform.companies.newCompany')}</span>
              <button type="button" onClick={() => setAdding(false)} className="rounded p-0.5 hover:bg-secondary"><X className="h-3.5 w-3.5" /></button></div>
            <Input name="name" placeholder={t('platform.company.info.nameLabel')} required />
            <Input name="name_ar" placeholder={t('platform.company.info.nameArLabel')} />
            <Input name="slug" placeholder="slug" dir="ltr" />
            <select name="business_type" defaultValue="general" className="w-full rounded-md border bg-background px-2 py-1.5 text-sm">
              {BUSINESS_TYPES.map((bt) => (
                <option key={bt} value={bt}>{BUSINESS_TYPE_LABELS[bt][locale === 'ar' ? 'ar' : 'en']}</option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <Input name="country" placeholder={t('platform.companies.create.country')} />
              <Input name="city" placeholder={t('platform.companies.create.city')} />
            </div>
            <select name="plan" defaultValue="standard" className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" aria-label={t('platform.companies.create.plan')}>
              {GENERAL_PLAN_KEYS.map((p) => (
                <option key={p} value={p}>{t(`platform.companies.create.plan_${p}`)}</option>
              ))}
            </select>
            <select name="status" defaultValue="active" className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" aria-label={t('platform.companies.create.status')}>
              <option value="active">{t('platform.companies.create.statusActive')}</option>
              <option value="suspended">{t('platform.companies.create.statusSuspended')}</option>
            </select>
            <label className="block text-xs text-muted-foreground">{t('platform.companies.create.trialStart')}
              <Input name="trial_start" type="date" dir="ltr" />
            </label>
            <label className="block text-xs text-muted-foreground">{t('platform.companies.create.trialDays')}
              <Input name="trial_days" type="number" min="0" dir="ltr" placeholder="0" />
            </label>
            <label className="block text-xs text-muted-foreground">{t('platform.companies.create.subscriptionEnd')}
              <Input name="subscription_end" type="date" dir="ltr" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_pilot" className="h-4 w-4" /> {t('platform.companies.create.pilot')}
            </label>
            <Button type="submit" size="sm" className="w-full" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}{t('platform.companies.newCompany')}</Button>
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

  return <AdminWorkbench list={list} detail={detail} />;
}
