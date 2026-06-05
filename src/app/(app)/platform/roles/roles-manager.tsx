'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import { usePrompt } from '@/components/prompt-dialog';
import { useConfirm } from '@/components/confirm-dialog';
import { isDangerousPermission, compareRoles } from '@/lib/erp/role-admin';
import { createRole, renameRole, deleteRole, cloneRole, setRolePermission } from './actions';
import { Plus, Copy, Trash2, Pencil, ShieldAlert, Search, GitCompare, Lock, X } from 'lucide-react';

export interface RoleRow { key: string; nameAr: string; isSystem: boolean; rank: number; permissions: string[] }
export interface PermMeta { key: string; en: string; ar: string; group: string }

export function RolesManager({
  roles, perms, groups,
}: {
  roles: RoleRow[];
  perms: PermMeta[];
  groups: { key: string; en: string; ar: string }[];
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const prompt = usePrompt();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [selectedKey, setSelectedKey] = useState<string>(roles[0]?.key ?? '');
  const [compareKey, setCompareKey] = useState<string>('');
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKey, setNewKey] = useState('');

  const selected = roles.find((r) => r.key === selectedKey) ?? null;
  const compare = roles.find((r) => r.key === compareKey) ?? null;
  const groupLabel = (g: string) => groups.find((x) => x.key === g)?.[locale] ?? g;
  const roleName = (r: RoleRow) => (locale === 'ar' ? r.nameAr : r.key);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error ?? t('platform.roles.toastError'));
      else { if (okMsg) toast.success(okMsg); router.refresh(); }
    });
  }

  // Permission groups, filtered by search + group filter.
  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out: { group: string; items: PermMeta[] }[] = [];
    for (const g of groups) {
      if (groupFilter && groupFilter !== g.key) continue;
      const items = perms.filter((p) => p.group === g.key &&
        (!q || p.key.toLowerCase().includes(q) || p.en.toLowerCase().includes(q) || p.ar.includes(search.trim())));
      if (items.length) out.push({ group: g.key, items });
    }
    return out;
  }, [perms, groups, search, groupFilter, selectedKey]);

  const selectedSet = new Set(selected?.permissions ?? []);
  const dangerCount = (selected?.permissions ?? []).filter(isDangerousPermission).length;

  function toggle(perm: string, on: boolean) {
    if (!selected) return;
    run(() => setRolePermission(selected.key, perm, on));
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      {/* ── Role list ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">{t('platform.roles.rolesTitle')}</p>
          <Button size="sm" variant="ghost" onClick={() => setCreating((v) => !v)}><Plus className="h-4 w-4" /></Button>
        </div>
        {creating && (
          <Card><CardContent className="space-y-2 p-3">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('platform.roles.nameAr')} dir="rtl" />
            <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder={t('platform.roles.key')} />
            <div className="flex gap-2">
              <Button size="sm" disabled={pending} onClick={() => run(async () => {
                const res = await createRole(newName, newKey || newName);
                if (res.ok) { setCreating(false); setNewName(''); setNewKey(''); }
                return res;
              }, t('platform.roles.created'))}>{t('platform.roles.create')}</Button>
              <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>{t('common.cancel')}</Button>
            </div>
          </CardContent></Card>
        )}
        <div className="space-y-1">
          {roles.map((r) => (
            <button
              key={r.key}
              onClick={() => setSelectedKey(r.key)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-start text-sm transition-colors ${selectedKey === r.key ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'}`}
            >
              <span className="flex items-center gap-1.5 truncate">
                {r.isSystem && <Lock className="h-3 w-3 shrink-0 opacity-60" />}
                <span className="truncate">{roleName(r)}</span>
              </span>
              <span className={`text-xs ${selectedKey === r.key ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{r.permissions.length}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Editor / compare ── */}
      <div className="space-y-3">
        {selected && (
          <>
            <Card><CardContent className="flex flex-wrap items-center gap-3 p-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold">{roleName(selected)}</span>
                  <Badge variant="secondary">{selected.key}</Badge>
                  {selected.isSystem && <Badge variant="outline">{t('platform.roles.system')}</Badge>}
                  {dangerCount > 0 && <Badge variant="warning"><ShieldAlert className="me-1 h-3 w-3" />{t('platform.roles.dangerCount', { n: dangerCount })}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{t('platform.roles.permCount', { n: selected.permissions.length })}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={pending} onClick={async () => {
                  const name = await prompt({ title: t('platform.roles.rename'), label: t('platform.roles.nameAr'), placeholder: selected.nameAr });
                  if (name) run(() => renameRole(selected.key, name), t('platform.roles.saved'));
                }}><Pencil className="h-4 w-4" /> {t('platform.roles.rename')}</Button>
                <Button size="sm" variant="outline" disabled={pending} onClick={async () => {
                  const k = await prompt({ title: t('platform.roles.cloneTitle'), label: t('platform.roles.key'), placeholder: `${selected.key}_copy` });
                  if (k) run(() => cloneRole(selected.key, k, `${selected.nameAr} (نسخة)`), t('platform.roles.cloned'));
                }}><Copy className="h-4 w-4" /> {t('platform.roles.clone')}</Button>
                {!selected.isSystem && (
                  <Button size="sm" variant="outline" disabled={pending} onClick={async () => {
                    const ok = await confirm({ title: t('platform.roles.deleteTitle'), message: t('platform.roles.deleteWarn', { role: roleName(selected) }), confirmText: t('platform.roles.delete'), destructive: true });
                    if (ok) { run(() => deleteRole(selected.key), t('platform.roles.deleted')); setSelectedKey(roles[0]?.key ?? ''); }
                  }}><Trash2 className="h-4 w-4" /> {t('platform.roles.delete')}</Button>
                )}
              </div>
            </CardContent></Card>

            {/* search + filters + compare picker */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute start-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('platform.roles.searchPerms')} className="ps-8" />
              </div>
              <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
                <option value="">{t('platform.roles.allGroups')}</option>
                {groups.map((g) => <option key={g.key} value={g.key}>{g[locale]}</option>)}
              </select>
              <select value={compareKey} onChange={(e) => setCompareKey(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
                <option value="">{t('platform.roles.compareWith')}</option>
                {roles.filter((r) => r.key !== selectedKey).map((r) => <option key={r.key} value={r.key}>{roleName(r)}</option>)}
              </select>
            </div>

            {/* compare view */}
            {compare && (
              <Card><CardContent className="p-4 text-xs">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold"><GitCompare className="me-1 inline h-3.5 w-3.5" />{t('platform.roles.comparing', { a: roleName(selected), b: roleName(compare) })}</span>
                  <button onClick={() => setCompareKey('')} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                </div>
                {(() => {
                  const c = compareRoles(selected.permissions, compare.permissions);
                  return (
                    <div className="grid gap-2 sm:grid-cols-3">
                      <CompareCol title={t('platform.roles.onlyHere', { role: roleName(selected) })} items={c.onlyA} tone="text-success" />
                      <CompareCol title={t('platform.roles.shared')} items={c.shared} tone="text-muted-foreground" />
                      <CompareCol title={t('platform.roles.onlyThere', { role: roleName(compare) })} items={c.onlyB} tone="text-destructive" />
                    </div>
                  );
                })()}
              </CardContent></Card>
            )}

            {/* permission groups */}
            {filteredGroups.map(({ group, items }) => (
              <Card key={group}><CardContent className="p-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">{groupLabel(group)}</p>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((p) => {
                    const danger = isDangerousPermission(p.key);
                    return (
                      <label key={p.key} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
                        <input type="checkbox" className="h-4 w-4 accent-primary" disabled={pending} checked={selectedSet.has(p.key)} onChange={(e) => toggle(p.key, e.target.checked)} />
                        <span className="truncate">{locale === 'ar' ? p.ar : p.en}</span>
                        {danger && <ShieldAlert className="ms-auto h-3.5 w-3.5 shrink-0 text-warning" />}
                      </label>
                    );
                  })}
                </div>
              </CardContent></Card>
            ))}
            {filteredGroups.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">{t('platform.roles.noPerms')}</p>}
          </>
        )}
      </div>
    </div>
  );
}

function CompareCol({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return (
    <div>
      <p className={`mb-1 font-semibold ${tone}`}>{title} ({items.length})</p>
      <div className="space-y-0.5">
        {items.map((p) => <div key={p} className="truncate font-mono text-[10px] text-muted-foreground">{p}</div>)}
      </div>
    </div>
  );
}
