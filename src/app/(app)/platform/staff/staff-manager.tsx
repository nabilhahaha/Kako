'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { UserPlus, ShieldCheck, Power, RotateCcw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { SectionHeader } from '@/components/shared/section-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
}
export interface RoleDefault { role: string; permission: string }
export interface OverrideRow { staff_id: string; permission: string; effect: 'grant' | 'deny' }

export function StaffManager({
  staff, roleDefaults, overrides, canInvite,
}: {
  staff: StaffRow[]; roleDefaults: RoleDefault[]; overrides: OverrideRow[]; canInvite: boolean;
}) {
  const { t, locale } = useI18n();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const lbl = (m: { en: string; ar: string }) => (locale === 'ar' ? m.ar : m.en);

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

  return (
    <div className="space-y-6">
      {/* Invite (owner only) */}
      {canInvite && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <SectionHeader icon={UserPlus} title={t('platformStaff.create.title')} />
            <form action={onCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="s-email">{t('platformStaff.create.email')}</Label>
                <Input id="s-email" name="email" type="email" required />
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
                <select id="s-role" name="role" required
                  className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                  {PLATFORM_ROLES.map((r) => (
                    <option key={r} value={r}>{lbl(PLATFORM_ROLE_LABELS[r])}</option>
                  ))}
                </select>
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
        <CardContent className="p-6 space-y-4">
          <SectionHeader icon={ShieldCheck} title={t('platformStaff.title')} />
          {staff.length === 0 ? (
            <EmptyState icon={<ShieldCheck />} title={t('platformStaff.empty')} />
          ) : (
            <div className="space-y-4">
              {staff.map((s) => (
                <div key={s.id} className={cn('rounded-lg border p-4', !s.isActive && 'opacity-60')}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{s.fullName || s.email || s.id}</div>
                      <div className="text-xs text-muted-foreground" dir="ltr">{s.email}</div>
                      {s.title && <div className="text-xs text-muted-foreground">{s.title}</div>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={s.isActive ? 'success' : 'destructive'}>
                        {s.isActive ? t('platformStaff.status.active') : t('platformStaff.status.disabled')}
                      </Badge>
                      <select
                        value={s.role}
                        disabled={busy || !s.isActive}
                        onChange={(e) => onRole(s, e.target.value)}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      >
                        {PLATFORM_ROLES.map((r) => (
                          <option key={r} value={r}>{lbl(PLATFORM_ROLE_LABELS[r as PlatformRole])}</option>
                        ))}
                        {!PLATFORM_ROLES.includes(s.role as PlatformRole) && (
                          <option value={s.role}>{s.role}</option>
                        )}
                      </select>
                      <Button variant="outline" size="sm" disabled={busy} onClick={() => onToggleActive(s)}>
                        {s.isActive ? <Power className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                        {s.isActive ? t('platformStaff.offboard.action') : t('platformStaff.offboard.reactivate')}
                      </Button>
                    </div>
                  </div>

                  {/* Effective permissions + overrides */}
                  <div className="mt-3 border-t pt-3">
                    <div className="mb-2 text-xs text-muted-foreground">{t('platformStaff.overrides.hint')}</div>
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
                            <select
                              value={st}
                              disabled={busy || !s.isActive}
                              onChange={(e) => onOverride(s, perm, e.target.value as 'grant' | 'deny' | 'default')}
                              className="h-7 rounded border border-input bg-background px-1 text-xs"
                            >
                              <option value="default">{t('platformStaff.overrides.default')}</option>
                              <option value="grant">{t('platformStaff.overrides.grant')}</option>
                              <option value="deny">{t('platformStaff.overrides.deny')}</option>
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
