'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Loader2, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { AdminWorkbench, useWorkbenchSelection } from '@/components/admin/admin-workbench';
import { EntityListPanel } from '@/components/admin/entity-list-panel';
import { EntityHeader, EntityTabs, DetailPlaceholder } from '@/components/admin/entity-detail';
import { SectionCard } from '@/components/admin/section-card';
import { ContextPanel, ContextSection, SummaryList } from '@/components/admin/context-panel';
import { ActivityFeed } from '@/components/admin/activity-feed';
import { ALL_MODULES, MODULE_LABELS, type Module } from '@/lib/erp/navigation';
import type { CompanyListRow, CompanyTabData } from './companies-workbench-server';
import {
  createCompany, updateCompany, setCompanyActive, setSubscriptionEnd, setCompanyPlan,
  setCompanyModule, addBranch,
} from './actions';
import { loadCompanyTabDataAction } from './companies-workbench-actions';

/**
 * Companies on the Admin Workbench (UX standardization only). Tabs (Profile,
 * Plans, Entitlements, Branches) reuse the existing platform actions verbatim.
 * No business-logic / permission / RLS / workflow change.
 */
export function CompaniesWorkbench({ companies }: { companies: CompanyListRow[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const { selectedId, tab, select, setTab } = useWorkbenchSelection('profile');
  const [data, setData] = useState<CompanyTabData | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedRow = companies.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) { setData(null); return; }
    setLoading(true);
    loadCompanyTabDataAction(selectedId).then((res) => {
      setData(res.ok ? res.data : null);
      setLoading(false);
      if (!res.ok) toast.error(t('adminWb.toastError'));
    });
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  function refresh() {
    if (selectedId) loadCompanyTabDataAction(selectedId).then((res) => res.ok && setData(res.data));
    router.refresh();
  }

  function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await createCompany(fd);
      if (!res.ok) { toast.error(res.error ?? t('adminWb.toastError')); return; }
      toast.success(t('adminWb.toastSaved'));
      setAdding(false);
      router.refresh();
    });
  }

  const list = (
    <EntityListPanel
      items={companies.map((c) => ({ id: c.id, primary: c.name_ar || c.name, secondary: c.plan_key ?? undefined, search: c.name }))}
      selectedId={selectedId}
      onSelect={select}
      searchPlaceholder={t('adminWb.companiesTitle')}
      quickCreate={
        !adding ? (
          <Button size="sm" className="w-full" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('adminWb.newCompany')}</Button>
        ) : (
          <form onSubmit={onCreate} className="space-y-2 rounded-md border p-2">
            <div className="flex items-center justify-between"><span className="text-xs font-medium">{t('adminWb.newCompany')}</span>
              <button type="button" onClick={() => setAdding(false)} className="rounded p-0.5 hover:bg-secondary"><X className="h-3.5 w-3.5" /></button></div>
            <Input name="name" placeholder={t('adminWb.companyName')} required />
            <Input name="name_ar" placeholder={t('adminWb.companyNameAr')} />
            <Input name="slug" placeholder="slug" dir="ltr" />
            <Button type="submit" size="sm" className="w-full" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}{t('adminWb.newCompany')}</Button>
          </form>
        )
      }
    />
  );

  if (!selectedRow) {
    return <AdminWorkbench list={list} detail={<DetailPlaceholder text={t('adminWb.companyPrompt')} />} />;
  }

  const c = data?.company;
  const detail = (
    <div>
      <EntityHeader
        title={selectedRow.name_ar || selectedRow.name}
        subtitle={selectedRow.name}
        status={<Badge variant={selectedRow.is_active ? 'secondary' : 'destructive'}>{selectedRow.is_active ? t('adminWb.active') : t('adminWb.inactive')}</Badge>}
      />
      <EntityTabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'profile', label: t('adminWb.tabProfile') },
          { key: 'plans', label: t('adminWb.tabPlans') },
          { key: 'entitlements', label: t('adminWb.tabEntitlements') },
          { key: 'branches', label: t('adminWb.tabBranches') },
        ]}
      />
      {loading || !data || !c ? (
        <DetailPlaceholder text="…" />
      ) : tab === 'profile' ? (
        <div className="space-y-3">
          <SectionCard title={t('adminWb.tabProfile')}>
            <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); fd.set('id', c.id); start(async () => { const r = await updateCompany(fd); if (!r.ok) toast.error(r.error ?? t('adminWb.toastError')); else { toast.success(t('adminWb.toastSaved')); refresh(); } }); }} className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1"><Label className="text-xs">{t('adminWb.companyName')}</Label><Input name="name" defaultValue={c.name} /></div>
                <div className="space-y-1"><Label className="text-xs">{t('adminWb.companyNameAr')}</Label><Input name="name_ar" defaultValue={c.name_ar ?? ''} /></div>
                <div className="space-y-1"><Label className="text-xs">business_type</Label><Input name="business_type" defaultValue={(c as { business_type?: string }).business_type ?? ''} dir="ltr" /></div>
              </div>
              <Button type="submit" size="sm" disabled={pending}>{t('adminWb.save')}</Button>
            </form>
          </SectionCard>
          <SectionCard title={t('adminWb.active')}>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await setCompanyActive(c.id, !c.is_active); if (!r.ok) toast.error(r.error ?? ''); else refresh(); })}>
                {c.is_active ? t('adminWb.inactive') : t('adminWb.active')}
              </Button>
              <div className="space-y-1">
                <Label className="text-xs">{t('adminWb.subscriptionEnd')}</Label>
                <Input type="date" defaultValue={(c as { subscription_end?: string }).subscription_end ?? ''} onChange={(e) => { const v = e.target.value; if (v) start(async () => { const r = await setSubscriptionEnd(c.id, v); if (!r.ok) toast.error(r.error ?? ''); else refresh(); }); }} className="w-44" />
              </div>
            </div>
          </SectionCard>
        </div>
      ) : tab === 'plans' ? (
        <SectionCard title={t('adminWb.plan')}>
          <div className="flex items-center gap-2">
            <Select defaultValue={c.plan_key ?? ''} onChange={(e) => { const v = e.target.value; start(async () => { const r = await setCompanyPlan(c.id, v); if (!r.ok) toast.error(r.error ?? ''); else { toast.success(t('adminWb.toastSaved')); refresh(); } }); }} className="w-56" disabled={pending}>
              <option value="">—</option>
              {data.plans.map((p) => <option key={p.key} value={p.key}>{p.name_ar || p.key}</option>)}
            </Select>
          </div>
          <SummaryList rows={[
            { label: 'max_users', value: String(data.plans.find((p) => p.key === c.plan_key)?.max_users ?? '—') },
            { label: 'max_branches', value: String(data.plans.find((p) => p.key === c.plan_key)?.max_branches ?? '—') },
          ]} />
        </SectionCard>
      ) : tab === 'entitlements' ? (
        <SectionCard title={t('adminWb.tabEntitlements')} description={c.plan_key ?? ''}>
          <div className="grid gap-1 sm:grid-cols-2">
            {ALL_MODULES.map((m) => {
              const on = data.enabledModules.includes(m);
              const planSet = c.plan_key ? data.modulesByPlan[c.plan_key] : undefined;
              const locked = planSet != null && !planSet.includes(m);
              return (
                <label key={m} className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm ${locked ? 'opacity-60' : ''}`}>
                  <span className="truncate">{MODULE_LABELS[m as Module]?.[locale] ?? m}</span>
                  <input type="checkbox" checked={on} disabled={pending} onChange={(e) => { const v = e.target.checked; start(async () => { const r = await setCompanyModule(c.id, m as Module, v); if (!r.ok) toast.error(r.error ?? ''); else refresh(); }); }} />
                </label>
              );
            })}
          </div>
        </SectionCard>
      ) : (
        <SectionCard title={t('adminWb.tabBranches')}>
          <div className="space-y-1">
            {data.branches.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : data.branches.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-md border px-2 py-1.5 text-sm">
                <span className="truncate">{b.code} · {b.name_ar || b.name}</span>
              </div>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); fd.set('company_id', c.id); start(async () => { const r = await addBranch(fd); if (!r.ok) toast.error(r.error ?? t('adminWb.toastError')); else { (e.target as HTMLFormElement).reset(); toast.success(t('adminWb.toastSaved')); refresh(); } }); }} className="mt-2 flex flex-wrap items-end gap-2">
            <Input name="code" placeholder="code" dir="ltr" className="w-24" required />
            <Input name="name" placeholder={t('adminWb.companyName')} className="w-40" required />
            <Input name="name_ar" placeholder={t('adminWb.companyNameAr')} className="w-40" />
            <Button type="submit" size="sm" disabled={pending}><Plus className="h-4 w-4" /> {t('adminWb.addBranch')}</Button>
          </form>
        </SectionCard>
      )}
    </div>
  );

  const context = (
    <ContextPanel>
      <ContextSection title={t('adminWb.summary')}>
        <SummaryList rows={[
          { label: t('adminWb.plan'), value: selectedRow.plan_key ?? '—' },
          { label: t('adminWb.tabBranches'), value: String(data?.branches.length ?? '—') },
          { label: t('adminWb.active'), value: selectedRow.is_active ? '✓' : '—' },
        ]} />
      </ContextSection>
      <ContextSection title={t('adminWb.audit')}>
        <ActivityFeed entityId={selectedRow.id} entities={['company', 'branch', 'plan', 'module', 'entitlement']} />
      </ContextSection>
    </ContextPanel>
  );

  return <AdminWorkbench list={list} detail={detail} context={context} contextLabel={t('adminWb.contextLabel')} />;
}
