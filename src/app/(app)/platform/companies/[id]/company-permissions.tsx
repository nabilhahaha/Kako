'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { ListToolbar } from '@/components/shared/list-toolbar';
import { Tooltip } from '@/components/ui/tooltip';
import { ALL_PERMISSIONS, PERMISSION_LABELS, PERMISSION_GROUP_LABELS, type Permission } from '@/lib/erp/permissions';
import {
  setCompanyRoleEnabled,
  setCompanyRolePermission,
  addCompanyRole,
} from './permission-actions';
import { Plus, Loader2, ChevronRight, ChevronDown, SearchX, SlidersHorizontal, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';

export interface CompanyRoleRow {
  key: string;
  name_ar: string;
  is_system: boolean;
  rank: number;
}

export function CompanyPermissions({
  companyId,
  roles,
  enabledRoles,
  permsByRole,
  view = 'permissions',
}: {
  companyId: string;
  roles: CompanyRoleRow[];
  /** role_keys enabled for this company */
  enabledRoles: string[];
  /** company-scoped permissions, per role_key */
  permsByRole: Record<string, string[]>;
  /** Which slice to render: the roles list, or the permission matrix. */
  view?: 'roles' | 'permissions';
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [pending, startTransition] = useTransition();

  const [search, setSearch] = useState('');

  // Summary-first (T1): default to a per-role permission-count list. The full
  // role×permission matrix (T3/T4) opens via "Edit / Advanced" — preserved, not default.
  const [mode, setMode] = useState<'summary' | 'matrix'>('summary');

  const [enabled, setEnabled] = useState<Set<string>>(new Set(enabledRoles));
  const [matrix, setMatrix] = useState<Record<string, Set<string>>>(
    Object.fromEntries(roles.map((r) => [r.key, new Set(permsByRole[r.key] ?? [])])),
  );

  function toggleRole(roleKey: string, on: boolean) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (on) next.add(roleKey);
      else next.delete(roleKey);
      return next;
    });
    startTransition(async () => {
      const res = await setCompanyRoleEnabled(companyId, roleKey, on);
      if (!res.ok) {
        toast.error(res.error ?? t('platform.permissions.toastError'));
      }
      // Enabling may seed default permissions server-side — refresh to reflect.
      router.refresh();
    });
  }

  function togglePerm(roleKey: string, perm: Permission, on: boolean) {
    setMatrix((prev) => {
      const next = { ...prev, [roleKey]: new Set(prev[roleKey] ?? []) };
      if (on) next[roleKey].add(perm);
      else next[roleKey].delete(perm);
      return next;
    });
    startTransition(async () => {
      const res = await setCompanyRolePermission(companyId, roleKey, perm, on);
      if (!res.ok) {
        toast.error(res.error ?? t('platform.permissions.toastError'));
        router.refresh();
      }
    });
  }

  /** Bulk-apply a set of permissions for a role, firing one action per change
   *  (preserves the exact per-toggle server-action contract). */
  function setManyPerms(roleKey: string, perms: Permission[], on: boolean) {
    const current = matrix[roleKey] ?? new Set<string>();
    const toChange = perms.filter((p) => current.has(p) !== on);
    if (toChange.length === 0) return;
    setMatrix((prev) => {
      const next = { ...prev, [roleKey]: new Set(prev[roleKey] ?? []) };
      for (const p of toChange) {
        if (on) next[roleKey].add(p);
        else next[roleKey].delete(p);
      }
      return next;
    });
    startTransition(async () => {
      let failed = false;
      for (const p of toChange) {
        const res = await setCompanyRolePermission(companyId, roleKey, p, on);
        if (!res.ok) failed = true;
      }
      if (failed) {
        toast.error(t('platform.permissions.toastError'));
        router.refresh();
      }
    });
  }

  function addRole() {
    startTransition(async () => {
      const res = await addCompanyRole(companyId, newName, newKey);
      if (!res.ok) {
        toast.error(res.error ?? t('platform.permissions.toastError'));
        return;
      }
      toast.success(t('platform.permissions.toastRoleAdded'));
      setAdding(false);
      setNewName('');
      setNewKey('');
      router.refresh();
    });
  }

  // Group permissions for display.
  const groups = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const p of ALL_PERMISSIONS) {
      const g = PERMISSION_LABELS[p].group;
      map.set(g, [...(map.get(g) ?? []), p]);
    }
    return map;
  }, []);

  // Apply the permission search filter (by label, in the active locale).
  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out: [string, Permission[]][] = [];
    for (const [group, perms] of groups.entries()) {
      const matched = q
        ? perms.filter((p) => PERMISSION_LABELS[p][locale].toLowerCase().includes(q))
        : perms;
      if (matched.length > 0) out.push([group, matched]);
    }
    return out;
  }, [groups, search, locale]);

  // Collapsible group state — collapsed set (default: all expanded).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  function toggleGroup(g: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }
  const allCollapsed = filteredGroups.length > 0 && filteredGroups.every(([g]) => collapsed.has(g));
  function toggleAllGroups() {
    if (allCollapsed) setCollapsed(new Set());
    else setCollapsed(new Set(filteredGroups.map(([g]) => g)));
  }

  /** Are all `perms` granted to `roleKey`? */
  function allOn(roleKey: string, perms: Permission[]): boolean {
    const set = matrix[roleKey];
    return perms.length > 0 && perms.every((p) => set?.has(p));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">
            {view === 'roles'
              ? t('platform.permissions.rolesTitle')
              : mode === 'summary'
                ? t('platform.permissions.summaryTitle')
                : t('platform.permissions.title')}
          </p>
          <p className="text-xs text-muted-foreground">
            {view === 'roles'
              ? t('platform.permissions.rolesDescription')
              : mode === 'summary'
                ? t('platform.permissions.summaryHint')
                : t('platform.permissions.description')}
          </p>
        </div>
        {!adding ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> {t('platform.permissions.newRole')}
          </Button>
        ) : null}
      </div>

      {adding && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 pt-6">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t('platform.permissions.roleNameLabel')}</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('platform.permissions.roleNamePlaceholder')} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t('platform.permissions.roleKeyLabel')}</label>
              <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} dir="ltr" placeholder={t('platform.permissions.roleKeyPlaceholder')} />
            </div>
            <Button onClick={addRole} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('platform.permissions.addButton')}
            </Button>
            <Button variant="outline" onClick={() => setAdding(false)}>{t('platform.permissions.cancelButton')}</Button>
          </CardContent>
        </Card>
      )}

      {view === 'roles' && (
        <Card>
          <CardContent className="p-0">
            {roles.length === 0 ? (
              <EmptyState title={t('platform.permissions.noRoles')} className="border-0" />
            ) : (
              <div className="divide-y">
                {roles.map((r) => (
                  <label key={r.key} className="flex cursor-pointer items-center justify-between gap-2 p-3 text-sm hover:bg-secondary/30">
                    <span className="font-medium">
                      {r.name_ar}
                      {!r.is_system && <span className="ms-2 text-xs text-muted-foreground">{t('platform.permissions.customBadge')}</span>}
                    </span>
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-primary"
                      checked={enabled.has(r.key)}
                      disabled={pending}
                      onChange={(e) => toggleRole(r.key, e.target.checked)}
                    />
                  </label>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {view === 'permissions' && mode === 'summary' && (
        <Card>
          <CardContent className="p-0">
            {roles.length === 0 ? (
              <EmptyState title={t('platform.permissions.noRoles')} className="border-0" />
            ) : (
              <div className="divide-y">
                {roles.map((r) => {
                  const roleOn = enabled.has(r.key);
                  const granted = roleOn ? (matrix[r.key]?.size ?? 0) : 0;
                  return (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => setMode('matrix')}
                      className="flex w-full items-center justify-between gap-3 p-3 text-start text-sm hover:bg-secondary/30"
                    >
                      <span className="min-w-0">
                        <span className="font-medium">
                          {r.name_ar}
                          {!r.is_system && (
                            <span className="ms-2 text-xs text-muted-foreground">{t('platform.permissions.customBadge')}</span>
                          )}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {roleOn ? (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {t('platform.permissions.summaryFmt', { granted, total: ALL_PERMISSIONS.length })}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t('platform.permissions.roleDisabledSummary')}</span>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
          <div className="border-t p-3">
            <Button variant="outline" size="sm" onClick={() => setMode('matrix')}>
              <SlidersHorizontal className="h-4 w-4" /> {t('platform.permissions.editAdvanced')}
            </Button>
          </div>
        </Card>
      )}

      {view === 'permissions' && mode === 'matrix' && (
        <>
          <ListToolbar
            search={search}
            onSearch={setSearch}
            placeholder={t('platform.permissions.searchPlaceholder')}
            actions={
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setMode('summary')}>
                  <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t('platform.permissions.backToSummary')}
                </Button>
                <Button variant="outline" size="sm" onClick={toggleAllGroups}>
                  {allCollapsed ? t('platform.permissions.expandAll') : t('platform.permissions.collapseAll')}
                </Button>
              </div>
            }
          />

          <Card>
            <CardContent className="p-0">
              {roles.length === 0 ? (
                <EmptyState title={t('platform.permissions.noRoles')} className="border-0" />
              ) : filteredGroups.length === 0 ? (
                <EmptyState icon={<SearchX />} title={t('platform.permissions.noResults')} className="border-0" />
              ) : (
                <div className="max-h-[70vh] overflow-auto">
                  <table className="w-full border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr>
                        <th className="sticky start-0 top-0 z-30 border-b bg-secondary/70 p-3 text-start font-medium backdrop-blur">
                          {t('platform.permissions.thPermission')}
                        </th>
                        {roles.map((r) => {
                          const roleOn = enabled.has(r.key);
                          const colAllOn = roleOn && allOn(r.key, ALL_PERMISSIONS);
                          return (
                            <th
                              key={r.key}
                              className="sticky top-0 z-20 border-b bg-secondary/70 p-3 text-center font-medium whitespace-nowrap backdrop-blur"
                            >
                              <div className="flex flex-col items-center gap-1">
                                <span>{r.name_ar}</span>
                                <label className="flex items-center gap-1 text-[11px] font-normal">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-primary"
                                    checked={roleOn}
                                    disabled={pending}
                                    onChange={(e) => toggleRole(r.key, e.target.checked)}
                                  />
                                  {t('platform.permissions.enabledLabel')}
                                </label>
                                <Tooltip label={t('platform.permissions.selectAllColumn')}>
                                  <input
                                    type="checkbox"
                                    aria-label={t('platform.permissions.selectAllColumn')}
                                    className="h-4 w-4 accent-primary disabled:opacity-40"
                                    checked={colAllOn}
                                    disabled={!roleOn || pending}
                                    onChange={(e) => setManyPerms(r.key, ALL_PERMISSIONS, e.target.checked)}
                                  />
                                </Tooltip>
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    {filteredGroups.map(([group, perms]) => {
                      const isCollapsed = collapsed.has(group);
                      return (
                        <tbody key={group}>
                          <tr className="bg-secondary/30">
                            <td className="sticky start-0 z-10 border-b bg-secondary/40 px-3 py-2">
                              <button
                                type="button"
                                onClick={() => toggleGroup(group)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
                              >
                                {isCollapsed ? (
                                  <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                )}
                                {PERMISSION_GROUP_LABELS[group]?.[locale] ?? group}
                                <span className="font-normal opacity-70">({perms.length})</span>
                              </button>
                            </td>
                            {roles.map((r) => {
                              const roleOn = enabled.has(r.key);
                              const groupAllOn = roleOn && allOn(r.key, perms);
                              return (
                                <td key={r.key} className="border-b bg-secondary/30 p-2 text-center">
                                  <Tooltip
                                    label={
                                      roleOn
                                        ? t('platform.permissions.selectAllGroup')
                                        : t('platform.permissions.roleDisabledTooltip')
                                    }
                                  >
                                    <input
                                      type="checkbox"
                                      aria-label={t('platform.permissions.selectAllGroup')}
                                      className="h-4 w-4 accent-primary disabled:cursor-not-allowed disabled:opacity-30"
                                      checked={groupAllOn}
                                      disabled={!roleOn || pending}
                                      onChange={(e) => setManyPerms(r.key, perms, e.target.checked)}
                                    />
                                  </Tooltip>
                                </td>
                              );
                            })}
                          </tr>
                          {!isCollapsed &&
                            perms.map((p) => (
                              <tr key={p} className="hover:bg-secondary/20">
                                <td className="sticky start-0 z-10 border-b bg-background p-3">
                                  {PERMISSION_LABELS[p][locale]}
                                </td>
                                {roles.map((r) => {
                                  const roleOn = enabled.has(r.key);
                                  const checked = matrix[r.key]?.has(p) ?? false;
                                  return (
                                    <td key={r.key} className="border-b p-0 text-center">
                                      {roleOn ? (
                                        <label className="flex h-full w-full cursor-pointer items-center justify-center p-3">
                                          <input
                                            type="checkbox"
                                            className="h-5 w-5 accent-primary"
                                            checked={checked}
                                            disabled={pending}
                                            onChange={(e) => togglePerm(r.key, p, e.target.checked)}
                                          />
                                        </label>
                                      ) : (
                                        <Tooltip
                                          label={t('platform.permissions.roleDisabledTooltip')}
                                          className="flex w-full items-center justify-center p-3"
                                        >
                                          <input
                                            type="checkbox"
                                            className="h-5 w-5 cursor-not-allowed opacity-30"
                                            checked={false}
                                            disabled
                                            readOnly
                                            aria-disabled
                                          />
                                        </Tooltip>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                        </tbody>
                      );
                    })}
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            {t('platform.permissions.footer')}
          </p>
        </>
      )}
    </div>
  );
}
