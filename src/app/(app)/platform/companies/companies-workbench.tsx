'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Loader2, X, Building2, CheckCircle2, Ban, Clock, Search, Users as UsersIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWorkbenchSelection } from '@/components/admin/admin-workbench';
import { StatCard } from '@/components/shared/stat-card';
import { PlatformTabs } from '@/components/platform/platform-tabs';
import { Company360 } from './[id]/company-360';
import { CompaniesTable, deriveState } from './companies-table';
import type { CompanyListRow } from './companies-workbench-server';
import type { CompanyDetailBundle } from './[id]/load';
import { createCompany, setCompanyPlan, setCompanyTrial, setCompanyActive } from './actions';
import { loadCompanyDetailBundleAction } from './companies-workbench-actions';
import { BUSINESS_TYPE_LABELS, BUSINESS_TYPES } from '@/lib/erp/subscription';

/** General company plans offered at creation (Route-Planner plans are provisioned from the
 *  Route Planner product, not the general workbench). */
const GENERAL_PLAN_KEYS = ['free', 'standard', 'pro', 'unlimited'] as const;

const STATUS_FILTERS = ['all', 'active', 'trial', 'suspended'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

/** Right-side drawer (no UI primitive exists) — overlay + end-anchored panel; closes on
 *  backdrop / Esc. `wide` is used for the content-rich Company 360. */
function Drawer({ open, onClose, title, wide, children }: { open: boolean; onClose: () => void; title: string; wide?: boolean; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`absolute inset-y-0 end-0 flex w-full ${wide ? 'max-w-4xl' : 'max-w-md'} flex-col bg-background shadow-xl`}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-secondary" aria-label="close"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Companies — the PRIMARY Platform Owner workspace, as a desktop-first console:
 * platform sub-tabs + a KPI band + a search/filter toolbar + a full-width companies
 * table; Create Company and the existing Company 360 detail open in a right drawer.
 * Layout/presentation only — every server action, the route guard, and Company 360 are
 * reused verbatim. The global Sidebar / TopBar (app shell) are untouched.
 */
export function CompaniesWorkbench({ companies }: { companies: CompanyListRow[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
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

  // KPI band — derived from the already-loaded rows (display-only).
  const kpis = useMemo(() => {
    let active = 0, trial = 0, suspended = 0, users = 0;
    for (const c of companies) {
      const s = deriveState(c);
      if (s === 'active') active++;
      else if (s === 'trial') trial++;
      else if (s === 'suspended') suspended++;
      users += c.userCount;
    }
    return { total: companies.length, active, trial, suspended, users };
  }, [companies]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return companies.filter((c) => {
      if (statusFilter !== 'all' && deriveState(c) !== statusFilter) return false;
      if (!needle) return true;
      return (c.name + ' ' + (c.name_ar ?? '')).toLowerCase().includes(needle);
    });
  }, [companies, query, statusFilter]);

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
      // Apply plan / trial / status through the canonical actions (best-effort; the company
      // exists either way — warn if an enrichment step is rejected).
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

  function toggleActive(id: string, nextActive: boolean) {
    start(async () => {
      const res = await setCompanyActive(id, nextActive);
      if (!res.ok) { toast.error(res.error ?? t('platform.company.toastError')); return; }
      toast.success(nextActive ? t('platform.companies.toastActivated') : t('platform.companies.toastSuspended'));
      router.refresh();
    });
  }

  const selectCls = 'w-full rounded-md border bg-background px-2 py-1.5 text-sm';

  return (
    <div className="mx-auto max-w-screen-2xl space-y-3">
      <PlatformTabs />

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t('platform.companies.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('platform.companies.subtitle')}</p>
        </div>
        <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('platform.companies.newCompany')}</Button>
      </div>

      {/* KPI band */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label={t('platform.companies.kpiTotal')} value={String(kpis.total)} icon={Building2} tone="primary" />
        <StatCard label={t('platform.companies.kpiActive')} value={String(kpis.active)} icon={CheckCircle2} tone="success" />
        <StatCard label={t('platform.companies.kpiTrial')} value={String(kpis.trial)} icon={Clock} tone="info" />
        <StatCard label={t('platform.companies.kpiSuspended')} value={String(kpis.suspended)} icon={Ban} tone={kpis.suspended > 0 ? 'warning' : 'primary'} />
        <StatCard label={t('platform.companies.kpiUsers')} value={String(kpis.users)} icon={UsersIcon} tone="primary" />
      </div>

      {/* Toolbar: search + status filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute inset-y-0 start-2 my-auto h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('platform.companies.searchPlaceholder')}
            className="ps-8"
          />
        </div>
        <div className="flex items-center gap-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === s ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary'
              }`}
            >
              {t(`platform.companies.filter_${s}`)}
            </button>
          ))}
        </div>
        <span className="ms-auto whitespace-nowrap text-xs text-muted-foreground">{t('platform.companies.countLabel', { count: rows.length, total: companies.length })}</span>
      </div>

      {/* Full-width companies table */}
      <CompaniesTable rows={rows} onManage={select} onToggleActive={toggleActive} pending={pending} />

      {/* Create Company drawer */}
      <Drawer open={adding} onClose={() => setAdding(false)} title={t('platform.companies.newCompany')}>
        <form onSubmit={onCreate} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {/* Identity */}
            <section className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('platform.companies.create.sectionIdentity')}</p>
              <Input name="name" placeholder={t('platform.company.info.nameLabel')} required />
              <Input name="name_ar" placeholder={t('platform.company.info.nameArLabel')} />
              <Input name="slug" placeholder="slug" dir="ltr" />
              <label className="block text-xs text-muted-foreground">{t('platform.companies.create.businessType')}
                <select name="business_type" defaultValue="general" className={`mt-1 ${selectCls}`}>
                  {BUSINESS_TYPES.map((bt) => (
                    <option key={bt} value={bt}>{BUSINESS_TYPE_LABELS[bt][locale === 'ar' ? 'ar' : 'en']}</option>
                  ))}
                </select>
              </label>
            </section>
            {/* Location */}
            <section className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('platform.companies.create.sectionLocation')}</p>
              <div className="grid grid-cols-2 gap-2">
                <Input name="country" placeholder={t('platform.companies.create.country')} />
                <Input name="city" placeholder={t('platform.companies.create.city')} />
              </div>
            </section>
            {/* Plan & trial */}
            <section className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('platform.companies.create.sectionPlan')}</p>
              <label className="block text-xs text-muted-foreground">{t('platform.companies.create.plan')}
                <select name="plan" defaultValue="standard" className={`mt-1 ${selectCls}`}>
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
            </section>
            {/* Status */}
            <section className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('platform.companies.create.sectionStatus')}</p>
              <label className="block text-xs text-muted-foreground">{t('platform.companies.create.status')}
                <select name="status" defaultValue="active" className={`mt-1 ${selectCls}`}>
                  <option value="active">{t('platform.companies.create.statusActive')}</option>
                  <option value="suspended">{t('platform.companies.create.statusSuspended')}</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="is_pilot" className="h-4 w-4" /> {t('platform.companies.create.pilot')}
              </label>
            </section>
          </div>
          <div className="border-t p-3">
            <Button type="submit" className="w-full" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}{t('platform.companies.create.submit')}</Button>
          </div>
        </form>
      </Drawer>

      {/* Company 360 detail drawer (reused verbatim) */}
      <Drawer open={!!selectedId} onClose={() => select('')} title={t('platform.companies.manage')} wide>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading || !bundle ? (
            <p className="p-6 text-center text-sm text-muted-foreground">…</p>
          ) : (
            <Company360 initialSection={tab} {...bundle} />
          )}
        </div>
      </Drawer>
    </div>
  );
}
