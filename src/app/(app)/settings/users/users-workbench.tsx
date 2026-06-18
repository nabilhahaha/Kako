'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Loader2, X, ShieldCheck, Trash2 } from 'lucide-react';
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
import { ContextPanel, ContextSection, SummaryList, ContextLink, RelatedChips } from '@/components/admin/context-panel';
import { initialsFromName } from '@/lib/utils';
import type { Branch, Profile, UserBranch } from '@/lib/erp/types';
import { createUser, assignBranch, removeAssignment, setUserFlags } from './actions';

interface RoleOption { key: string; name_ar: string }
interface Props {
  currentUserId: string;
  profiles: Profile[];
  branches: Branch[];
  assignments: UserBranch[];
  roles: RoleOption[];
}

/**
 * Users module on the Admin Workbench (UX standardization only). Reuses the
 * existing server actions (createUser/assignBranch/removeAssignment/setUserFlags)
 * and data verbatim — no business-logic, permission, RLS, or workflow change.
 */
export function UsersWorkbench({ currentUserId, profiles, branches, assignments, roles }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const { selectedId, tab, select, setTab } = useWorkbenchSelection('profile');

  const roleLabel = (key: string) => roles.find((r) => r.key === key)?.name_ar ?? key;
  const branchName = (id: string) => {
    const b = branches.find((x) => x.id === id);
    return b ? `${b.code} · ${b.name_ar || b.name}` : id;
  };
  const refresh = () => router.refresh();
  const selected = profiles.find((p) => p.id === selectedId) ?? null;

  function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    start(async () => {
      const res = await createUser(formData);
      if (!res.ok) { toast.error(res.error ?? t('settings.genericError')); return; }
      toast.success(t('settings.users.toastUserCreated'));
      form.reset();
      setAdding(false);
      refresh();
    });
  }

  const list = (
    <EntityListPanel
      items={profiles.map((p) => ({
        id: p.id,
        primary: p.full_name || p.email || t('settings.users.fallbackUser'),
        secondary: assignments.find((a) => a.user_id === p.id)?.role ? roleLabel(assignments.find((a) => a.user_id === p.id)!.role) : undefined,
        search: p.email ?? '',
      }))}
      selectedId={selectedId}
      onSelect={select}
      searchPlaceholder={t('settings.users.pageTitle')}
      emptyText={t('settings.users.fallbackUser')}
      quickCreate={
        <div>
          {!adding ? (
            <Button size="sm" className="w-full" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> {t('settings.users.newUser')}
            </Button>
          ) : (
            <form onSubmit={onCreate} className="space-y-2 rounded-md border p-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{t('settings.users.newUserTitle')}</span>
                <button type="button" onClick={() => setAdding(false)} className="rounded p-0.5 hover:bg-secondary"><X className="h-3.5 w-3.5" /></button>
              </div>
              <Input name="full_name" placeholder={t('settings.users.namePlaceholder')} />
              <Input name="email" type="email" dir="ltr" placeholder={t('settings.users.emailLabel')} required />
              <Input name="password" type="text" dir="ltr" placeholder={t('settings.users.passwordPlaceholder')} required />
              <Button type="submit" size="sm" className="w-full" disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('settings.users.createButton')}
              </Button>
            </form>
          )}
        </div>
      }
    />
  );

  if (!selected) {
    return <AdminWorkbench list={list} detail={<DetailPlaceholder text={t('adminWb.selectPrompt')} />} />;
  }

  const name = selected.full_name || selected.email || t('settings.users.fallbackUser');
  const isSelf = selected.id === currentUserId;
  const userAssignments = assignments.filter((a) => a.user_id === selected.id);

  function toggleFlag(flags: { is_active?: boolean; is_super_admin?: boolean }) {
    start(async () => {
      const res = await setUserFlags(selected!.id, flags);
      if (!res.ok) toast.error(res.error ?? t('settings.genericError')); else refresh();
    });
  }

  const detail = (
    <div>
      <EntityHeader
        title={name}
        subtitle={selected.email ?? undefined}
        status={
          <>
            {selected.is_super_admin && <Badge variant="info"><ShieldCheck className="ms-1 h-3 w-3" /> {t('settings.users.badgeSuperAdmin')}</Badge>}
            {!selected.is_active && <Badge variant="destructive">{t('settings.users.badgeSuspended')}</Badge>}
          </>
        }
        actions={!isSelf && (
          <>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => toggleFlag({ is_super_admin: !selected.is_super_admin })}>
              {selected.is_super_admin ? t('settings.users.revokeSuperAdmin') : t('settings.users.setSuperAdmin')}
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => toggleFlag({ is_active: !selected.is_active })}>
              {selected.is_active ? t('settings.users.deactivate') : t('settings.users.activate')}
            </Button>
          </>
        )}
      />
      <EntityTabs
        active={tab}
        onChange={setTab}
        tabs={[{ key: 'profile', label: t('adminWb.tabProfile') }, { key: 'roles', label: t('adminWb.tabRolesBranches') }]}
      />

      {tab === 'profile' && (
        <div className="space-y-3">
          <SectionCard title={t('adminWb.identity')}>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{initialsFromName(name)}</span>
              <div>
                <p className="font-medium">{name}</p>
                <p dir="ltr" className="text-sm text-muted-foreground">{selected.email}</p>
              </div>
            </div>
          </SectionCard>
          <SectionCard title={t('adminWb.status')}>
            <SummaryList rows={[
              { label: t('settings.users.badgeSuperAdmin'), value: selected.is_super_admin ? '✓' : '—' },
              { label: t('adminWb.status'), value: selected.is_active ? '✓' : t('settings.users.badgeSuspended') },
            ]} />
          </SectionCard>
        </div>
      )}

      {tab === 'roles' && (
        <RolesBranchesTab
          selected={selected} userAssignments={userAssignments} branches={branches} roles={roles}
          allProfiles={profiles} branchName={branchName} roleLabel={roleLabel} pending={pending}
          onChange={refresh} start={start}
        />
      )}
    </div>
  );

  const context = (
    <ContextPanel>
      <ContextSection title={t('adminWb.summary')}>
        <SummaryList rows={[
          { label: t('adminWb.role'), value: userAssignments[0] ? roleLabel(userAssignments[0].role) : '—' },
          { label: t('adminWb.branches'), value: String(userAssignments.length) },
          { label: t('adminWb.status'), value: selected.is_active ? '✓' : t('settings.users.badgeSuspended') },
        ]} />
      </ContextSection>
      <ContextSection title={t('adminWb.audit')}>
        <ContextLink href="/settings/audit-log" label={t('adminWb.viewAudit')} />
      </ContextSection>
      <ContextSection title={t('adminWb.related')}>
        <RelatedChips items={userAssignments.map((a) => ({ label: branchName(a.branch_id), href: '/settings/branches' }))} />
      </ContextSection>
    </ContextPanel>
  );

  return <AdminWorkbench list={list} detail={detail} context={context} contextLabel={t('adminWb.contextLabel')} />;
}

function RolesBranchesTab({
  selected, userAssignments, branches, roles, allProfiles, branchName, roleLabel, pending, onChange, start,
}: {
  selected: Profile; userAssignments: UserBranch[]; branches: Branch[]; roles: RoleOption[];
  allProfiles: Profile[]; branchName: (id: string) => string; roleLabel: (k: string) => string;
  pending: boolean; onChange: () => void; start: (cb: () => void) => void;
}) {
  const { t } = useI18n();
  const [branchId, setBranchId] = useState('');
  const [role, setRole] = useState('salesman');
  const [reportsTo, setReportsTo] = useState('');
  const showSupervisor = role === 'salesman' || role === 'cashier';

  function add() {
    if (!branchId) { toast.error(t('settings.users.toastSelectBranch')); return; }
    start(async () => {
      const res = await assignBranch(selected.id, branchId, role, showSupervisor ? reportsTo : null);
      if (!res.ok) toast.error(res.error ?? t('settings.genericError'));
      else { toast.success(t('settings.users.toastBranchAssigned')); setBranchId(''); setReportsTo(''); onChange(); }
    });
  }
  function remove(bid: string) {
    start(async () => {
      const res = await removeAssignment(selected.id, bid);
      if (!res.ok) toast.error(res.error ?? t('settings.genericError')); else onChange();
    });
  }

  return (
    <SectionCard title={t('settings.users.branchesAndRoles')}>
      {userAssignments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('settings.users.noAssignments')}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {userAssignments.map((a) => (
            <span key={a.branch_id} className="inline-flex items-center gap-2 rounded-full border bg-secondary px-3 py-1 text-xs">
              {branchName(a.branch_id)} <span className="text-muted-foreground">({roleLabel(a.role)})</span>
              <button onClick={() => remove(a.branch_id)} disabled={pending} className="text-destructive hover:opacity-70" aria-label={t('settings.users.ariaRemove')}>
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{t('settings.users.branchLabel')}</Label>
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="h-9 w-44">
            <option value="">{t('settings.users.branchPlaceholder')}</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name_ar || b.name}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('settings.users.roleLabel')}</Label>
          <Select value={role} onChange={(e) => setRole(e.target.value)} className="h-9 w-40">
            {roles.map((r) => <option key={r.key} value={r.key}>{r.name_ar}</option>)}
          </Select>
        </div>
        {showSupervisor && (
          <div className="space-y-1">
            <Label className="text-xs">{t('settings.users.reportsToLabel')}</Label>
            <Select value={reportsTo} onChange={(e) => setReportsTo(e.target.value)} className="h-9 w-44">
              <option value="">{t('settings.users.reportsToNone')}</option>
              {allProfiles.filter((u) => u.id !== selected.id).map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
            </Select>
          </div>
        )}
        <Button size="sm" onClick={add} disabled={pending}><Plus className="h-4 w-4" /> {t('settings.users.assignButton')}</Button>
      </div>
    </SectionCard>
  );
}
