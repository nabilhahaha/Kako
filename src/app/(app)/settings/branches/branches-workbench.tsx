'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Loader2, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AdminWorkbench, useWorkbenchSelection } from '@/components/admin/admin-workbench';
import { EntityListPanel } from '@/components/admin/entity-list-panel';
import { EntityHeader, EntityTabs, DetailPlaceholder } from '@/components/admin/entity-detail';
import { SectionCard } from '@/components/admin/section-card';
import { ContextPanel, ContextSection, SummaryList } from '@/components/admin/context-panel';
import { ActivityFeed } from '@/components/admin/activity-feed';
import type { Branch, Company } from '@/lib/erp/types';
import { upsertBranch, toggleBranchActive } from './actions';

interface BranchMember { user_id: string; branch_id: string; role: string; name: string }

/**
 * Branches on the Admin Workbench (UX standardization only). Reuses upsertBranch
 * / toggleBranchActive verbatim. No business-logic / permission / RLS / workflow
 * change.
 */
export function BranchesWorkbench({ company, branches, members }: { company: Company; branches: Branch[]; members: BranchMember[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const { selectedId, tab, select, setTab } = useWorkbenchSelection('details');
  const selected = branches.find((b) => b.id === selectedId) ?? null;
  const refresh = () => router.refresh();

  function submitBranch(e: React.FormEvent<HTMLFormElement>, id?: string) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set('company_id', company.id);
    if (id) fd.set('id', id);
    start(async () => {
      const res = await upsertBranch(fd);
      if (!res.ok) { toast.error(res.error ?? t('settings.genericError')); return; }
      toast.success(id ? t('settings.branches.toastUpdated') : t('settings.branches.toastAdded'));
      if (!id) { (e.target as HTMLFormElement).reset(); setAdding(false); }
      refresh();
    });
  }

  const list = (
    <EntityListPanel
      items={branches.map((b) => ({ id: b.id, primary: `${b.code} · ${b.name_ar || b.name}`, secondary: b.is_active ? undefined : t('settings.branches.badgeSuspended'), search: b.name }))}
      selectedId={selectedId}
      onSelect={select}
      searchPlaceholder={t('adminWb.branchesTitle')}
      emptyText={t('settings.branches.empty')}
      quickCreate={
        !adding ? (
          <Button size="sm" className="w-full" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('settings.branches.newBranch')}</Button>
        ) : (
          <form onSubmit={(e) => submitBranch(e)} className="space-y-2 rounded-md border p-2">
            <div className="flex items-center justify-between"><span className="text-xs font-medium">{t('settings.branches.newBranch')}</span>
              <button type="button" onClick={() => setAdding(false)} className="rounded p-0.5 hover:bg-secondary"><X className="h-3.5 w-3.5" /></button></div>
            <Input name="code" placeholder={t('settings.branches.branchCodeLabel')} dir="ltr" required />
            <Input name="name" placeholder={t('settings.branches.nameLabel')} required />
            <Input name="name_ar" placeholder={t('settings.branches.nameArLabel')} />
            <Button type="submit" size="sm" className="w-full" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}{t('settings.branches.addBranch')}</Button>
          </form>
        )
      }
    />
  );

  if (!selected) {
    return <AdminWorkbench list={list} detail={<DetailPlaceholder text={t('adminWb.branchPrompt')} />} />;
  }

  const branchMembers = members.filter((m) => m.branch_id === selected.id);

  const detail = (
    <div>
      <EntityHeader
        title={`${selected.code} · ${selected.name_ar || selected.name}`}
        status={<>
          {selected.is_hq && <Badge variant="info">{t('settings.branches.badgeHq')}</Badge>}
          {!selected.is_active && <Badge variant="destructive">{t('settings.branches.badgeSuspended')}</Badge>}
        </>}
        actions={
          <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await toggleBranchActive(selected.id, !selected.is_active); if (!r.ok) toast.error(r.error ?? ''); else refresh(); })}>
            {selected.is_active ? t('settings.branches.deactivate') : t('settings.branches.activate')}
          </Button>
        }
      />
      <EntityTabs active={tab} onChange={setTab} tabs={[{ key: 'details', label: t('adminWb.tabDetails') }, { key: 'members', label: t('adminWb.tabMembers') }]} />

      {tab === 'details' ? (
        <SectionCard title={t('adminWb.tabDetails')}>
          <form onSubmit={(e) => submitBranch(e, selected.id)} className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1"><Label className="text-xs">{t('settings.branches.branchCodeLabel')}</Label><Input name="code" defaultValue={selected.code} dir="ltr" /></div>
              <div className="space-y-1"><Label className="text-xs">{t('settings.branches.nameLabel')}</Label><Input name="name" defaultValue={selected.name} /></div>
              <div className="space-y-1"><Label className="text-xs">{t('settings.branches.nameArLabel')}</Label><Input name="name_ar" defaultValue={selected.name_ar ?? ''} /></div>
              <div className="space-y-1"><Label className="text-xs">{t('settings.branches.cityLabel')}</Label><Input name="city" defaultValue={(selected as { city?: string }).city ?? ''} /></div>
              <div className="space-y-1"><Label className="text-xs">{t('settings.branches.phoneLabel')}</Label><Input name="phone" defaultValue={(selected as { phone?: string }).phone ?? ''} dir="ltr" /></div>
              <div className="space-y-1 sm:col-span-2"><Label className="text-xs">{t('settings.branches.addressLabel')}</Label><Input name="address" defaultValue={(selected as { address?: string }).address ?? ''} /></div>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_hq" defaultChecked={selected.is_hq} /> {t('settings.branches.isHq')}</label>
            <Button type="submit" size="sm" disabled={pending}>{t('settings.branches.editBranch')}</Button>
          </form>
        </SectionCard>
      ) : (
        <SectionCard title={t('adminWb.tabMembers')}>
          {branchMembers.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : (
            <div className="space-y-1">{branchMembers.map((m) => (
              <div key={m.user_id} className="flex items-center justify-between rounded-md border px-2 py-1.5 text-sm">
                <span className="truncate">{m.name}</span><span className="text-xs text-muted-foreground">{m.role}</span>
              </div>
            ))}</div>
          )}
        </SectionCard>
      )}
    </div>
  );

  const context = (
    <ContextPanel>
      <ContextSection title={t('adminWb.summary')}>
        <SummaryList rows={[
          { label: t('adminWb.members'), value: String(branchMembers.length) },
          { label: t('adminWb.active'), value: selected.is_active ? '✓' : '—' },
        ]} />
      </ContextSection>
      <ContextSection title={t('adminWb.audit')}>
        <ActivityFeed entityId={selected.id} entities={['branch']} />
      </ContextSection>
    </ContextPanel>
  );

  return <AdminWorkbench list={list} detail={detail} context={context} contextLabel={t('adminWb.contextLabel')} />;
}
