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
import { createCompany } from './actions';
import { loadCompanyDetailBundleAction } from './companies-workbench-actions';

/**
 * Companies on the Admin Workbench — the PRIMARY company administration center.
 * Left = companies list + quick-create; center = the full existing Company360
 * detail (Profile/Subscription/Users/Roles/Permissions/Modules/Packs/Integrations/
 * Audit) for the selected company, reused verbatim. No business-logic / permission
 * / RLS / workflow change. The /platform/companies/[id] route redirects here.
 */
export function CompaniesWorkbench({ companies }: { companies: CompanyListRow[] }) {
  const { t } = useI18n();
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
    start(async () => {
      const res = await createCompany(fd);
      if (!res.ok) { toast.error(res.error ?? t('platform.company.toastError')); return; }
      toast.success(t('platform.companies.toastCreated'));
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
