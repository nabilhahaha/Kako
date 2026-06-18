'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Lock, ArrowRight, Copy, Users } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { effectivePermissionsDiff } from '@/lib/role-governance';
import {
  setRolePermissionOverride, clearRolePermissionOverride, resetRolePermissionOverrides,
  loadRoleOverrideStateAction, cloneRolePermissionOverrides,
} from './actions';

interface Role { key: string; nameAr: string | null }
interface Group { key: string; permissions: string[] }
type Setting = 'default' | 'grant' | 'revoke';

const PROTECTED_SAMPLE = ['returns.approve', 'accounting.post', 'treasury.transfer', 'super.admin'];

export function RoleOverridesConsole({ roles, groups, lockedRoleKey }: { roles: Role[]; groups: Group[]; lockedRoleKey?: string }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Role | null>(
    lockedRoleKey ? roles.find((r) => r.key === lockedRoleKey) ?? null : null,
  );
  const [baselineHas, setBaselineHas] = useState<Record<string, boolean>>({});
  const [settings, setSettings] = useState<Record<string, Setting>>({});
  const [pending, start] = useTransition();
  const [reasonFor, setReasonFor] = useState<{ permission: string; effect: 'grant' | 'revoke' } | null>(null);
  const [reason, setReason] = useState('');
  const [cloneTargets, setCloneTargets] = useState<string[]>([]);

  const allPerms = useMemo(() => groups.flatMap((g) => g.permissions), [groups]);
  const filtered = useMemo(
    () => roles.filter((r) => r.key.toLowerCase().includes(query.trim().toLowerCase()) || (r.nameAr ?? '').includes(query.trim())),
    [roles, query],
  );

  function selectRole(r: Role) {
    setSelected(r);
    setCloneTargets([]);
    start(async () => {
      const res = await loadRoleOverrideStateAction(r.key);
      if (!res.ok) { toast.error(t('roleOverrides.error')); return; }
      setBaselineHas(res.state.baselineHas);
      const s: Record<string, Setting> = {};
      for (const p of allPerms) s[p] = 'default';
      for (const o of res.state.overrides) s[o.permission] = o.effect;
      setSettings(s);
    });
  }

  // Embedded mode: auto-load the locked role's state on mount.
  useEffect(() => {
    if (lockedRoleKey) {
      const r = roles.find((x) => x.key === lockedRoleKey);
      if (r) selectRole(r);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedRoleKey]);

  function onSelectChange(permission: string, value: Setting) {
    if (value === 'default') { applyChange(permission, 'default', ''); return; }
    setReason('');
    setReasonFor({ permission, effect: value });
  }

  function applyChange(permission: string, value: Setting, why: string) {
    if (!selected) return;
    start(async () => {
      const res = value === 'default'
        ? await clearRolePermissionOverride(selected.key, permission)
        : await setRolePermissionOverride(selected.key, permission, value, why);
      if (!res.ok) { toast.error(res.error === 'reason_required' ? t('roleOverrides.reasonRequired') : t('roleOverrides.error')); return; }
      setSettings((prev) => ({ ...prev, [permission]: value }));
      setReasonFor(null);
      toast.success(t('roleOverrides.saved'));
    });
  }

  function resetRole() {
    if (!selected) return;
    start(async () => {
      const res = await resetRolePermissionOverrides(selected.key);
      if (!res.ok) { toast.error(t('roleOverrides.error')); return; }
      const s: Record<string, Setting> = {};
      for (const p of allPerms) s[p] = 'default';
      setSettings(s);
      toast.success(t('roleOverrides.saved'));
    });
  }

  function applyClone() {
    if (!selected) return;
    if (cloneTargets.length === 0) { toast.error(t('roleOverrides.clone.noTargets')); return; }
    if (!reason.trim()) { toast.error(t('roleOverrides.reasonRequired')); return; }
    start(async () => {
      const res = await cloneRolePermissionOverrides(selected.key, cloneTargets, reason);
      if (!res.ok) { toast.error(res.error === 'no_delegable_overrides' ? t('roleOverrides.clone.noOverrides') : t('roleOverrides.error')); return; }
      toast.success(t('roleOverrides.clone.applied').replace('{n}', String(res.applied)));
      setCloneTargets([]); setReason('');
    });
  }

  const diff = useMemo(() => {
    const baseline = allPerms.filter((p) => baselineHas[p]);
    const overrides = allPerms
      .filter((p) => settings[p] === 'grant' || settings[p] === 'revoke')
      .map((p) => ({ permission: p, effect: settings[p] as 'grant' | 'revoke' }));
    return effectivePermissionsDiff(baseline, overrides);
  }, [allPerms, baselineHas, settings]);

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-muted-foreground">
        {t('roleOverrides.safetyNote')}
      </p>

      <div className={lockedRoleKey ? '' : 'grid gap-4 lg:grid-cols-[240px_1fr]'}>
        {!lockedRoleKey && (
        <Card>
          <CardContent className="space-y-2 p-3">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('roleOverrides.searchRoles')} />
            <div className="max-h-[28rem] space-y-1 overflow-auto">
              {filtered.map((r) => (
                <button
                  key={r.key}
                  onClick={() => selectRole(r)}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-start text-sm hover:bg-secondary ${selected?.key === r.key ? 'bg-secondary' : ''}`}
                >
                  <span className="truncate">{r.nameAr || r.key}</span>
                  <span className="ms-2 shrink-0 text-xs text-muted-foreground" dir="ltr">{r.key}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
        )}

        <div className="space-y-4">
          {!selected ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t('roleOverrides.searchRoles')}</CardContent></Card>
          ) : (
            <>
              <Card>
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{t('roleOverrides.permissionsFor')} {selected.nameAr || selected.key}</p>
                    <Button variant="outline" size="sm" onClick={resetRole} disabled={pending}>{t('roleOverrides.resetRole')}</Button>
                  </div>

                  {groups.map((g) => (
                    <div key={g.key} className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(`roleOverrides.groups.${g.key}`)}</p>
                      {g.permissions.map((p) => (
                        <div key={p} className="flex items-center justify-between gap-3 rounded-md border p-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium" dir="ltr">{p}</p>
                            <Badge variant="outline" className="mt-0.5 text-[10px]">
                              {baselineHas[p] ? t('roleOverrides.roleHas') : t('roleOverrides.roleLacks')}
                            </Badge>
                          </div>
                          <Select className="w-36" value={settings[p] ?? 'default'} onChange={(e) => onSelectChange(p, e.target.value as Setting)} disabled={pending}>
                            <option value="default">{t('roleOverrides.settingDefault')}</option>
                            <option value="grant">{t('roleOverrides.settingGrant')}</option>
                            <option value="revoke">{t('roleOverrides.settingRevoke')}</option>
                          </Select>
                        </div>
                      ))}
                    </div>
                  ))}

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('roleOverrides.notDelegable')}</p>
                    {PROTECTED_SAMPLE.map((p) => (
                      <div key={p} className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-2" title={t('roleOverrides.notDelegableTip')}>
                        <p className="flex items-center gap-2 truncate text-sm text-muted-foreground" dir="ltr"><Lock className="h-3.5 w-3.5" /> {p}</p>
                        <span className="text-xs text-muted-foreground">{t('roleOverrides.notDelegable')}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-2 p-4">
                  <p className="font-semibold">{t('roleOverrides.diffTitle')} · {selected.nameAr || selected.key}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium text-emerald-600">▲ {t('roleOverrides.roleAdded')} ({diff.addedByGrant.length})</p>
                      <ul className="text-sm" dir="ltr">{diff.addedByGrant.map((p) => <li key={p}>{p}</li>)}</ul>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-amber-600">▼ {t('roleOverrides.roleRemoved')} ({diff.removedByRevoke.length})</p>
                      <ul className="text-sm" dir="ltr">{diff.removedByRevoke.map((p) => <li key={p}>{p}</li>)}</ul>
                    </div>
                  </div>
                  <Link href="/settings/audit-log" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                    {t('roleOverrides.viewAudit')} <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                  </Link>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-3 p-4">
                  <div>
                    <p className="flex items-center gap-2 font-semibold"><Copy className="h-4 w-4" /> {t('roleOverrides.clone.title')}</p>
                    <p className="text-sm text-muted-foreground">{t('roleOverrides.clone.desc')}</p>
                  </div>
                  <p className="text-xs text-muted-foreground"><Users className="me-1 inline h-3.5 w-3.5" />{t('roleOverrides.clone.to')}</p>
                  <div className="max-h-40 space-y-1 overflow-auto rounded-md border p-2">
                    {roles.filter((r) => r.key !== selected.key).map((r) => (
                      <label key={r.key} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-secondary">
                        <input type="checkbox" checked={cloneTargets.includes(r.key)} onChange={(e) => setCloneTargets((prev) => e.target.checked ? [...prev, r.key] : prev.filter((x) => x !== r.key))} />
                        <span className="truncate">{r.nameAr || r.key}</span>
                        <span className="ms-auto text-xs text-muted-foreground" dir="ltr">{r.key}</span>
                      </label>
                    ))}
                  </div>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('roleOverrides.reasonPlaceholder')} />
                  <Button size="sm" onClick={applyClone} disabled={pending || cloneTargets.length === 0}>{t('roleOverrides.clone.apply')}</Button>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {reasonFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setReasonFor(null)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardContent className="space-y-3 p-4">
              <p className="font-semibold">
                {reasonFor.effect === 'grant' ? t('roleOverrides.settingGrant') : t('roleOverrides.settingRevoke')} · <span dir="ltr">{reasonFor.permission}</span>
              </p>
              <label className="text-sm font-medium">{t('roleOverrides.reasonTitle')}</label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('roleOverrides.reasonPlaceholder')} autoFocus />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setReasonFor(null)}>{t('roleOverrides.cancel')}</Button>
                <Button size="sm" disabled={!reason.trim() || pending} onClick={() => applyChange(reasonFor.permission, reasonFor.effect, reason)}>
                  {t('roleOverrides.save')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
