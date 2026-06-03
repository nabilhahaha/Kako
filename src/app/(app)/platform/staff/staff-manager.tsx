'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  UserPlus, ShieldCheck, Power, RotateCcw, ChevronDown, ChevronRight, Globe, Info, Clock,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { ListToolbar } from '@/components/shared/list-toolbar';
import { EmptyState } from '@/components/shared/empty-state';
import { useI18n } from '@/lib/i18n/provider';
import { useConfirm } from '@/components/confirm-dialog';
import { cn } from '@/lib/utils';
import {
  PLATFORM_ROLES, PLATFORM_PERMISSIONS, PLATFORM_ROLE_LABELS, PLATFORM_PERMISSION_LABELS,
  type PlatformRole, type PlatformPermission,
} from '@/lib/erp/platform-permissions';
import { createStaff, setStaffRole, setStaffOverride, setStaffActive } from './actions';

export interface StaffRow {
  id: string; role: string; title: string | null; isActive: boolean;
  email: string | null; fullName: string | null;
  /** Derived from the latest erp_audit_logs actor entry (see staff/page.tsx). */
  lastActiveAt: string | null;
}
export interface RoleDefault { role: string; permission: string }
export interface OverrideRow { staff_id: string; permission: string; effect: 'grant' | 'deny' }

type StatusFilter = 'all' | 'active' | 'offboarded';
type SortKey = 'name' | 'lastActive';

/** Compact relative-time formatter for the "last active" indicator. */
function relativeTime(iso: string, locale: 'en' | 'ar'): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const sec = Math.round((Date.now() - then) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale === 'ar' ? 'ar-EG' : 'en', { numeric: 'auto' });
  const abs = Math.abs(sec);
  if (abs < 60) return rtf.format(-sec, 'second');
  const min = Math.round(sec / 60);
  if (Math.abs(min) < 60) return rtf.format(-min, 'minute');
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 24) return rtf.format(-hr, 'hour');
  const day = Math.round(hr / 24);
  if (Math.abs(day) < 30) return rtf.format(-day, 'day');
  const month = Math.round(day / 30);
  if (Math.abs(month) < 12) return rtf.format(-month, 'month');
  return rtf.format(-Math.round(month / 12), 'year');
}

export function StaffManager({
  staff, roleDefaults, overrides, canInvite,
}: {
  staff: StaffRow[]; roleDefaults: RoleDefault[]; overrides: OverrideRow[]; canInvite: boolean;
}) {
  const { t, locale } = useI18n();
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);

  // Quick-action deep-link: /platform/staff?invite=1 scrolls to and focuses the
  // existing invite form (read-only trigger of client UI; no write on its own).
  const inviteRef = useRef<HTMLFormElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const didAutoInvite = useRef(false);
  useEffect(() => {
    if (didAutoInvite.current) return;
    if (!canInvite) return;
    if (searchParams?.get('invite') !== '1') return;
    didAutoInvite.current = true;
    const id = window.setTimeout(() => {
      inviteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      emailRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(id);
  }, [searchParams, canInvite]);
  const lbl = (m: { en: string; ar: string }) => (locale === 'ar' ? m.ar : m.en);

  // ── search / filters ──────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');

  // ── selection (bulk) + per-row permission expansion ───────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  const defaultsByRole = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const r of roleDefaults) {
      if (!m.has(r.role)) m.set(r.role, new Set());
      m.get(r.role)!.add(r.permission);
    }
    return m;
  }, [roleDefaults]);

  const overridesByStaff = useMemo(() => {
    const m = new Map<string, Map<string, 'grant' | 'deny'>>();
    for (const o of overrides) {
      if (!m.has(o.staff_id)) m.set(o.staff_id, new Map());
      m.get(o.staff_id)!.set(o.permission, o.effect);
    }
    return m;
  }, [overrides]);

  /** Effective permission for a staff member: role default ∪ grant − deny. */
  function isEffective(s: StaffRow, perm: string): boolean {
    const ov = overridesByStaff.get(s.id)?.get(perm);
    if (ov === 'grant') return true;
    if (ov === 'deny') return false;
    return defaultsByRole.get(s.role)?.has(perm) ?? false;
  }
  function overrideState(s: StaffRow, perm: string): 'grant' | 'deny' | 'default' {
    return overridesByStaff.get(s.id)?.get(perm) ?? 'default';
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = staff.filter((s) => {
      if (roleFilter !== 'all' && s.role !== roleFilter) return false;
      if (statusFilter === 'active' && !s.isActive) return false;
      if (statusFilter === 'offboarded' && s.isActive) return false;
      if (q) {
        const hay = `${s.fullName ?? ''} ${s.email ?? ''} ${s.title ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (sortKey === 'lastActive') {
      // Most recently active first; "Never" (null) sinks to the bottom.
      rows.sort((a, b) => (b.lastActiveAt ? Date.parse(b.lastActiveAt) : 0) - (a.lastActiveAt ? Date.parse(a.lastActiveAt) : 0));
    } else {
      rows.sort((a, b) =>
        (a.fullName || a.email || '').localeCompare(b.fullName || b.email || '', locale === 'ar' ? 'ar' : 'en'),
      );
    }
    return rows;
  }, [staff, search, roleFilter, statusFilter, sortKey, locale]);

  const selectedRows = filtered.filter((s) => selected.has(s.id));

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelected((prev) => {
      if (filtered.every((s) => prev.has(s.id)) && filtered.length > 0) return new Set();
      return new Set(filtered.map((s) => s.id));
    });
  }
  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) return toast.error(res.error ?? t('platformStaff.toast.error'));
      toast.success(okMsg);
    } catch {
      toast.error(t('platformStaff.toast.error'));
    } finally {
      setBusy(false);
    }
  }

  async function onCreate(form: FormData) {
    await run(() => createStaff(form), t('platformStaff.create.success'));
  }
  async function onRole(s: StaffRow, role: string) {
    if (role === s.role) return;
    await run(() => setStaffRole(s.id, role), t('platformStaff.roleChange.success'));
  }
  async function onOverride(s: StaffRow, perm: string, effect: 'grant' | 'deny' | 'default') {
    await run(() => setStaffOverride(s.id, perm, effect === 'default' ? null : effect), t('platformStaff.toast.saved'));
  }
  async function onToggleActive(s: StaffRow) {
    if (s.isActive) {
      const ok = await confirm({
        title: t('platformStaff.offboard.action'),
        message: t('platformStaff.offboard.confirm'),
        destructive: true,
      });
      if (!ok) return;
      await run(() => setStaffActive(s.id, false), t('platformStaff.offboard.success'));
    } else {
      await run(() => setStaffActive(s.id, true), t('platformStaff.offboard.reactivateSuccess'));
    }
  }

  /** Bulk activate/deactivate by looping the EXISTING setStaffActive per id. */
  async function onBulkActive(active: boolean) {
    const targets = selectedRows.filter((s) => s.isActive !== active);
    if (targets.length === 0) return;
    if (!active) {
      const ok = await confirm({
        title: t('platformStaff.offboard.action'),
        message: t('platformStaff.offboard.confirm'),
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    let done = 0;
    let failed = 0;
    setBulkProgress({ done: 0, total: targets.length });
    for (const s of targets) {
      try {
        const res = await setStaffActive(s.id, active);
        if (!res.ok) failed += 1;
      } catch {
        failed += 1;
      }
      done += 1;
      setBulkProgress({ done, total: targets.length });
    }
    setBulkProgress(null);
    setBusy(false);
    setSelected(new Set());
    if (failed > 0) toast.error(t('platformStaff.toast.error'));
    else toast.success(t('platformStaff.bulk.done', { count: done }));
  }

  const allSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.id));

  return (
    <div className="space-y-6">
      {/* Invite (owner only) */}
      {canInvite && (
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
              <UserPlus className="h-4 w-4" /> {t('platformStaff.create.title')}
            </h2>
            <form ref={inviteRef} action={onCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="s-email">{t('platformStaff.create.email')}</Label>
                <Input ref={emailRef} id="s-email" name="email" type="email" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-name">{t('platformStaff.create.fullName')}</Label>
                <Input id="s-name" name="full_name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-pass">{t('platformStaff.create.password')}</Label>
                <Input id="s-pass" name="password" type="text" minLength={6} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-role">{t('platformStaff.create.role')}</Label>
                <Select id="s-role" name="role" required>
                  {PLATFORM_ROLES.map((r) => (
                    <option key={r} value={r}>{lbl(PLATFORM_ROLE_LABELS[r])}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-title">{t('platformStaff.create.jobTitle')}</Label>
                <Input id="s-title" name="title" />
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={busy}>
                  <UserPlus className="h-4 w-4" /> {t('platformStaff.create.submit')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Staff list */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <ShieldCheck className="h-4 w-4" /> {t('platformStaff.title')}
          </h2>

          {staff.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck />}
              title={t('platformStaff.empty')}
            />
          ) : (
            <>
              <ListToolbar
                search={search}
                onSearch={setSearch}
                placeholder={t('platformStaff.searchPlaceholder')}
                count={filtered.length}
                total={staff.length}
                filters={
                  <>
                    <Select
                      value={roleFilter}
                      onChange={(e) => setRoleFilter(e.target.value)}
                      className="h-9 w-auto"
                    >
                      <option value="all">{t('platformStaff.filterRoleAll')}</option>
                      {PLATFORM_ROLES.map((r) => (
                        <option key={r} value={r}>{lbl(PLATFORM_ROLE_LABELS[r])}</option>
                      ))}
                    </Select>
                    <Select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                      className="h-9 w-auto"
                    >
                      <option value="all">{t('platformStaff.filterStatusAll')}</option>
                      <option value="active">{t('platformStaff.filterStatusActive')}</option>
                      <option value="offboarded">{t('platformStaff.filterStatusOffboarded')}</option>
                    </Select>
                    <Select
                      value={sortKey}
                      onChange={(e) => setSortKey(e.target.value as SortKey)}
                      className="h-9 w-auto"
                    >
                      <option value="name">{t('platformStaff.sortName')}</option>
                      <option value="lastActive">{t('platformStaff.sortLastActive')}</option>
                    </Select>
                  </>
                }
              />

              {/* Bulk action bar */}
              <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-secondary/30 px-3 py-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-input"
                    aria-label={t('platformStaff.bulk.selectAll')}
                  />
                  {selectedRows.length > 0
                    ? t('platformStaff.bulk.selected', { count: selectedRows.length })
                    : t('platformStaff.bulk.selectAll')}
                </label>
                {bulkProgress && (
                  <span className="text-xs text-muted-foreground" dir="ltr">
                    {t('platformStaff.bulk.progress', { done: bulkProgress.done, total: bulkProgress.total })}
                  </span>
                )}
                <div className="flex items-center gap-2 sm:ms-auto">
                  <Button
                    variant="outline" size="sm"
                    disabled={busy || selectedRows.length === 0}
                    onClick={() => onBulkActive(true)}
                  >
                    <RotateCcw className="h-4 w-4" /> {t('platformStaff.bulk.activate')}
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    disabled={busy || selectedRows.length === 0}
                    onClick={() => onBulkActive(false)}
                  >
                    <Power className="h-4 w-4" /> {t('platformStaff.bulk.deactivate')}
                  </Button>
                  {selectedRows.length > 0 && (
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => setSelected(new Set())}>
                      {t('platformStaff.bulk.clear')}
                    </Button>
                  )}
                </div>
              </div>

              {filtered.length === 0 ? (
                <EmptyState
                  title={t('platformStaff.noResults')}
                  description={t('platformStaff.noResultsHint')}
                />
              ) : (
                <div className="space-y-4">
                  {filtered.map((s) => {
                    const isOpen = expanded.has(s.id);
                    return (
                      <div key={s.id} className={cn('rounded-lg border p-4', !s.isActive && 'opacity-60')}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={selected.has(s.id)}
                              onChange={() => toggleSelect(s.id)}
                              className="mt-1 h-4 w-4 rounded border-input"
                              aria-label={s.fullName || s.email || s.id}
                            />
                            <div>
                              <div className="font-medium">{s.fullName || s.email || s.id}</div>
                              <div className="text-xs text-muted-foreground" dir="ltr">{s.email}</div>
                              {s.title && <div className="text-xs text-muted-foreground">{s.title}</div>}
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <Badge variant="outline" className="gap-1">
                                  <Globe className="h-3 w-3" /> {t('platformStaff.scopePlatformWide')}
                                </Badge>
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  {s.lastActiveAt
                                    ? t('platformStaff.lastActive', { when: relativeTime(s.lastActiveAt, locale) })
                                    : t('platformStaff.lastActiveNever')}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={s.isActive ? 'success' : 'secondary'}>
                              {s.isActive ? t('platformStaff.status.active') : t('platformStaff.status.disabled')}
                            </Badge>
                            <Select
                              value={s.role}
                              disabled={busy || !s.isActive}
                              onChange={(e) => onRole(s, e.target.value)}
                              className="h-9 w-auto"
                            >
                              {PLATFORM_ROLES.map((r) => (
                                <option key={r} value={r}>{lbl(PLATFORM_ROLE_LABELS[r as PlatformRole])}</option>
                              ))}
                              {!PLATFORM_ROLES.includes(s.role as PlatformRole) && (
                                <option value={s.role}>{s.role}</option>
                              )}
                            </Select>
                            <Button variant="outline" size="sm" disabled={busy} onClick={() => onToggleActive(s)}>
                              {s.isActive ? <Power className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                              {s.isActive ? t('platformStaff.offboard.action') : t('platformStaff.offboard.reactivate')}
                            </Button>
                          </div>
                        </div>

                        {/* Collapsible effective permissions + overrides */}
                        <div className="mt-3 border-t pt-3">
                          <button
                            type="button"
                            onClick={() => toggleExpand(s.id)}
                            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                          >
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            {isOpen ? t('platformStaff.overrides.hide') : t('platformStaff.overrides.show')}
                          </button>

                          {isOpen && (
                            <div className="mt-3 space-y-3">
                              {/* Legend */}
                              <div className="rounded-md bg-secondary/40 p-3 text-xs text-muted-foreground">
                                <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                                  <Info className="h-3.5 w-3.5" /> {t('platformStaff.overrides.legendTitle')}
                                </div>
                                <ul className="space-y-0.5">
                                  <li>{t('platformStaff.overrides.legendGrant')}</li>
                                  <li>{t('platformStaff.overrides.legendDeny')}</li>
                                  <li>{t('platformStaff.overrides.legendDefault')}</li>
                                </ul>
                                <div className="mt-1.5">{t('platformStaff.overrides.hint')}</div>
                              </div>
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {PLATFORM_PERMISSIONS.map((perm) => {
                                  const eff = isEffective(s, perm);
                                  const st = overrideState(s, perm);
                                  return (
                                    <div key={perm} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5">
                                      <span className="flex items-center gap-1.5 text-sm">
                                        <span className={cn('inline-block h-2 w-2 rounded-full', eff ? 'bg-success' : 'bg-muted-foreground/40')} />
                                        {lbl(PLATFORM_PERMISSION_LABELS[perm as PlatformPermission])}
                                      </span>
                                      <Select
                                        value={st}
                                        disabled={busy || !s.isActive}
                                        onChange={(e) => onOverride(s, perm, e.target.value as 'grant' | 'deny' | 'default')}
                                        className="h-7 w-auto pe-7 text-xs"
                                      >
                                        <option value="default">{t('platformStaff.overrides.default')}</option>
                                        <option value="grant">{t('platformStaff.overrides.grant')}</option>
                                        <option value="deny">{t('platformStaff.overrides.deny')}</option>
                                      </Select>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
