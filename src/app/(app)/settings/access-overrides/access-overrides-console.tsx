'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Lock, ArrowRight, Users, Copy } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { effectivePermissionsDiff } from '@/lib/role-governance';
import {
  setUserAccessOverride, clearUserAccessOverride, resetUserAccessOverrides,
  loadMemberOverrideStateAction, cloneUserAccessOverrides,
} from './actions';

interface Member { id: string; name: string; roleKeys: string[] }
interface Group { key: string; permissions: string[] }
type Setting = 'default' | 'grant' | 'revoke';

// Representative protected permissions, shown locked so admins can SEE that they
// exist and are deliberately non-delegable (the visible face of the deny-list).
const PROTECTED_SAMPLE = ['returns.approve', 'accounting.post', 'integrations.manage', 'super.admin'];

export function AccessOverridesConsole({ members, groups }: { members: Member[]; groups: Group[] }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Member | null>(null);
  const [baselineHas, setBaselineHas] = useState<Record<string, boolean>>({});
  const [settings, setSettings] = useState<Record<string, Setting>>({});
  const [pending, start] = useTransition();
  const [reasonFor, setReasonFor] = useState<{ permission: string; effect: 'grant' | 'revoke' } | null>(null);
  const [reason, setReason] = useState('');
  const [cloneTargets, setCloneTargets] = useState<string[]>([]);

  const allPerms = useMemo(() => groups.flatMap((g) => g.permissions), [groups]);
  const filtered = useMemo(
    () => members.filter((m) => m.name.toLowerCase().includes(query.trim().toLowerCase())),
    [members, query],
  );

  function selectMember(m: Member) {
    setSelected(m);
    setCloneTargets([]);
    start(async () => {
      const res = await loadMemberOverrideStateAction(m.id, m.roleKeys);
      if (!res.ok) { toast.error(t('accessOverrides.error')); return; }
      setBaselineHas(res.state.baselineHas);
      const s: Record<string, Setting> = {};
      for (const p of allPerms) s[p] = 'default';
      for (const o of res.state.overrides) s[o.permission] = o.effect;
      setSettings(s);
    });
  }

  function onSelectChange(permission: string, value: Setting) {
    if (value === 'default') { applyChange(permission, 'default', ''); return; }
    setReason('');
    setReasonFor({ permission, effect: value });
  }

  function applyChange(permission: string, value: Setting, why: string) {
    if (!selected) return;
    start(async () => {
      const res = value === 'default'
        ? await clearUserAccessOverride(selected.id, permission)
        : await setUserAccessOverride(selected.id, permission, value, why);
      if (!res.ok) { toast.error(res.error === 'reason_required' ? t('accessOverrides.reasonRequired') : t('accessOverrides.error')); return; }
      setSettings((prev) => ({ ...prev, [permission]: value }));
      setReasonFor(null);
      toast.success(t('accessOverrides.saved'));
    });
  }

  function resetUser() {
    if (!selected) return;
    start(async () => {
      const res = await resetUserAccessOverrides(selected.id);
      if (!res.ok) { toast.error(t('accessOverrides.error')); return; }
      const s: Record<string, Setting> = {};
      for (const p of allPerms) s[p] = 'default';
      setSettings(s);
      toast.success(t('accessOverrides.saved'));
    });
  }

  function applyClone() {
    if (!selected) return;
    if (cloneTargets.length === 0) { toast.error(t('accessOverrides.clone.noTargets')); return; }
    if (!reason.trim()) { toast.error(t('accessOverrides.reasonRequired')); return; }
    start(async () => {
      const res = await cloneUserAccessOverrides(selected.id, cloneTargets, reason);
      if (!res.ok) {
        toast.error(res.error === 'no_delegable_overrides' ? t('accessOverrides.clone.noOverrides') : t('accessOverrides.error'));
        return;
      }
      toast.success(t('accessOverrides.clone.applied').replace('{n}', String(res.applied)));
      setCloneTargets([]); setReason('');
    });
  }

  // Operational diff (baseline ∩ delegable → +grants / −revokes).
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
        {t('accessOverrides.safetyNote')}
      </p>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* User selection */}
        <Card>
          <CardContent className="space-y-2 p-3">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('accessOverrides.searchUsers')} />
            <div className="max-h-[28rem] space-y-1 overflow-auto">
              {filtered.map((m) => (
                <button
                  key={m.id}
                  onClick={() => selectMember(m)}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-start text-sm hover:bg-secondary ${selected?.id === m.id ? 'bg-secondary' : ''}`}
                >
                  <span className="min-w-0 truncate">{m.name}</span>
                  <span className="ms-2 shrink-0 text-xs text-muted-foreground">{m.roleKeys[0]}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Editor */}
        <div className="space-y-4">
          {!selected ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t('accessOverrides.selectUserPrompt')}</CardContent></Card>
          ) : (
            <>
              <Card>
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{t('accessOverrides.permissionsFor')} {selected.name}</p>
                    <Button variant="outline" size="sm" onClick={resetUser} disabled={pending}>{t('accessOverrides.resetUser')}</Button>
                  </div>

                  {/* Grouped operational permissions */}
                  {groups.map((g) => (
                    <div key={g.key} className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t(`accessOverrides.groups.${g.key}`)}
                      </p>
                      {g.permissions.map((p) => (
                        <div key={p} className="flex items-center justify-between gap-3 rounded-md border p-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium" dir="ltr">{p}</p>
                            <Badge variant="outline" className="mt-0.5 text-[10px]">
                              {baselineHas[p] ? t('accessOverrides.roleHas') : t('accessOverrides.roleLacks')}
                            </Badge>
                          </div>
                          <Select
                            className="w-40"
                            value={settings[p] ?? 'default'}
                            onChange={(e) => onSelectChange(p, e.target.value as Setting)}
                            disabled={pending}
                          >
                            <option value="default">{t('accessOverrides.settingDefault')}</option>
                            <option value="grant">{t('accessOverrides.settingGrant')}</option>
                            <option value="revoke">{t('accessOverrides.settingRevoke')}</option>
                          </Select>
                        </div>
                      ))}
                    </div>
                  ))}

                  {/* Locked / non-delegable */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('accessOverrides.notDelegable')}
                    </p>
                    {PROTECTED_SAMPLE.map((p) => (
                      <div key={p} className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-2" title={t('accessOverrides.notDelegableTip')}>
                        <p className="flex items-center gap-2 truncate text-sm text-muted-foreground" dir="ltr">
                          <Lock className="h-3.5 w-3.5" /> {p}
                        </p>
                        <span className="text-xs text-muted-foreground">{t('accessOverrides.notDelegable')}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Effective permissions diff */}
              <Card>
                <CardContent className="space-y-2 p-4">
                  <p className="font-semibold">{t('accessOverrides.diffTitle')} · {selected.name}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium text-emerald-600">▲ {t('accessOverrides.addedByGrant')} ({diff.addedByGrant.length})</p>
                      <ul className="text-sm" dir="ltr">{diff.addedByGrant.map((p) => <li key={p}>{p}</li>)}</ul>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-amber-600">▼ {t('accessOverrides.removedByRevoke')} ({diff.removedByRevoke.length})</p>
                      <ul className="text-sm" dir="ltr">{diff.removedByRevoke.map((p) => <li key={p}>{p}</li>)}</ul>
                    </div>
                  </div>
                  <Link href="/settings/audit-log" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                    {t('accessOverrides.viewAudit')} <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                  </Link>
                </CardContent>
              </Card>

              {/* Override templates / cloning */}
              <Card>
                <CardContent className="space-y-3 p-4">
                  <div>
                    <p className="flex items-center gap-2 font-semibold"><Copy className="h-4 w-4" /> {t('accessOverrides.clone.title')}</p>
                    <p className="text-sm text-muted-foreground">{t('accessOverrides.clone.desc')}</p>
                  </div>
                  <p className="text-xs text-muted-foreground"><Users className="me-1 inline h-3.5 w-3.5" />{t('accessOverrides.clone.to')}</p>
                  <div className="max-h-40 space-y-1 overflow-auto rounded-md border p-2">
                    {members.filter((m) => m.id !== selected.id).map((m) => (
                      <label key={m.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-secondary">
                        <input
                          type="checkbox"
                          checked={cloneTargets.includes(m.id)}
                          onChange={(e) => setCloneTargets((prev) => e.target.checked ? [...prev, m.id] : prev.filter((x) => x !== m.id))}
                        />
                        <span className="truncate">{m.name}</span>
                        <span className="ms-auto text-xs text-muted-foreground">{m.roleKeys[0]}</span>
                      </label>
                    ))}
                  </div>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('accessOverrides.reasonPlaceholder')} />
                  <Button size="sm" onClick={applyClone} disabled={pending || cloneTargets.length === 0}>
                    {t('accessOverrides.clone.apply')}
                  </Button>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Mandatory-reason modal for grant/revoke */}
      {reasonFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setReasonFor(null)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardContent className="space-y-3 p-4">
              <p className="font-semibold">
                {reasonFor.effect === 'grant' ? t('accessOverrides.settingGrant') : t('accessOverrides.settingRevoke')} · <span dir="ltr">{reasonFor.permission}</span>
              </p>
              <label className="text-sm font-medium">{t('accessOverrides.reasonTitle')}</label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('accessOverrides.reasonPlaceholder')} autoFocus />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setReasonFor(null)}>{t('accessOverrides.cancel')}</Button>
                <Button
                  size="sm"
                  disabled={!reason.trim() || pending}
                  onClick={() => applyChange(reasonFor.permission, reasonFor.effect, reason)}
                >
                  {t('accessOverrides.save')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
