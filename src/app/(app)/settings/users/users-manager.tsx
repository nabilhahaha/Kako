'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createUser,
  assignBranch,
  removeAssignment,
  setUserFlags,
} from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { initialsFromName } from '@/lib/utils';
import type { Branch, Profile, UserBranch } from '@/lib/erp/types';
import { Plus, Loader2, X, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';

interface RoleOption {
  key: string;
  name_ar: string;
}

interface Props {
  currentUserId: string;
  profiles: Profile[];
  branches: Branch[];
  assignments: UserBranch[];
  roles: RoleOption[];
}

export function UsersManager({
  currentUserId,
  profiles,
  branches,
  assignments,
  roles,
}: Props) {
  const roleLabel = (key: string) => roles.find((r) => r.key === key)?.name_ar ?? key;
  const router = useRouter();
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();

  function refresh() {
    router.refresh();
  }

  function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const res = await createUser(formData);
      if (!res.ok) {
        toast.error(res.error ?? t('settings.genericError'));
        return;
      }
      toast.success(t('settings.users.toastUserCreated'));
      form.reset();
      setAdding(false);
      refresh();
    });
  }

  const branchName = (id: string) => {
    const b = branches.find((x) => x.id === id);
    return b ? `${b.code} · ${b.name_ar || b.name}` : id;
  };

  return (
    <div className="space-y-4">
      {!adding && (
        <Button onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> {t('settings.users.newUser')}
        </Button>
      )}

      {adding && (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">{t('settings.users.newUserTitle')}</h3>
              <button
                onClick={() => setAdding(false)}
                className="rounded-md p-1 hover:bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={onCreate} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="full_name">{t('settings.users.nameLabel')}</Label>
                  <Input id="full_name" name="full_name" placeholder={t('settings.users.namePlaceholder')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t('settings.users.emailLabel')}</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    dir="ltr"
                    className="text-left"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t('settings.users.passwordLabel')}</Label>
                  <Input
                    id="password"
                    name="password"
                    type="text"
                    dir="ltr"
                    className="text-left"
                    placeholder={t('settings.users.passwordPlaceholder')}
                    required
                  />
                </div>
              </div>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('settings.users.createButton')}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {profiles.map((p) => {
          const userAssignments = assignments.filter(
            (a) => a.user_id === p.id,
          );
          const isSelf = p.id === currentUserId;
          return (
            <UserCard
              key={p.id}
              profile={p}
              isSelf={isSelf}
              assignments={userAssignments}
              branches={branches}
              allProfiles={profiles}
              roles={roles}
              roleLabel={roleLabel}
              branchName={branchName}
              pending={pending}
              onChange={refresh}
              startTransition={startTransition}
            />
          );
        })}
      </div>
    </div>
  );
}

function UserCard({
  profile,
  isSelf,
  assignments,
  branches,
  allProfiles,
  roles,
  roleLabel,
  branchName,
  pending,
  onChange,
  startTransition,
}: {
  profile: Profile;
  isSelf: boolean;
  assignments: UserBranch[];
  branches: Branch[];
  allProfiles: Profile[];
  roles: RoleOption[];
  roleLabel: (key: string) => string;
  branchName: (id: string) => string;
  pending: boolean;
  onChange: () => void;
  startTransition: (cb: () => void) => void;
}) {
  const { t } = useI18n();
  const [branchId, setBranchId] = useState('');
  const [role, setRole] = useState<string>('salesman');
  const [reportsTo, setReportsTo] = useState('');

  // Reps/cashiers usually roll up to a supervisor or manager.
  const showSupervisor = role === 'salesman' || role === 'cashier';

  function add() {
    if (!branchId) {
      toast.error(t('settings.users.toastSelectBranch'));
      return;
    }
    startTransition(async () => {
      const res = await assignBranch(profile.id, branchId, role, showSupervisor ? reportsTo : null);
      if (!res.ok) toast.error(res.error ?? t('settings.genericError'));
      else {
        toast.success(t('settings.users.toastBranchAssigned'));
        setBranchId('');
        setReportsTo('');
        onChange();
      }
    });
  }

  function remove(bid: string) {
    startTransition(async () => {
      const res = await removeAssignment(profile.id, bid);
      if (!res.ok) toast.error(res.error ?? t('settings.genericError'));
      else onChange();
    });
  }

  function toggleFlag(flags: { is_active?: boolean; is_super_admin?: boolean }) {
    startTransition(async () => {
      const res = await setUserFlags(profile.id, flags);
      if (!res.ok) toast.error(res.error ?? t('settings.genericError'));
      else onChange();
    });
  }

  const name = profile.full_name || profile.email || t('settings.users.fallbackUser');

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {initialsFromName(name)}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold">{name}</p>
                {profile.is_super_admin && (
                  <Badge variant="info">
                    <ShieldCheck className="ms-1 h-3 w-3" /> {t('settings.users.badgeSuperAdmin')}
                  </Badge>
                )}
                {!profile.is_active && (
                  <Badge variant="destructive">{t('settings.users.badgeSuspended')}</Badge>
                )}
              </div>
              <p dir="ltr" className="text-right text-sm text-muted-foreground">
                {profile.email}
              </p>
            </div>
          </div>

          {!isSelf && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  toggleFlag({ is_super_admin: !profile.is_super_admin })
                }
              >
                {profile.is_super_admin ? t('settings.users.revokeSuperAdmin') : t('settings.users.setSuperAdmin')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => toggleFlag({ is_active: !profile.is_active })}
              >
                {profile.is_active ? t('settings.users.deactivate') : t('settings.users.activate')}
              </Button>
            </div>
          )}
        </div>

        {/* Branch assignments */}
        <div className="mt-4 border-t pt-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {t('settings.users.branchesAndRoles')}
          </p>
          {assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('settings.users.noAssignments')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {assignments.map((a) => (
                <span
                  key={a.branch_id}
                  className="inline-flex items-center gap-2 rounded-full border bg-secondary px-3 py-1 text-xs"
                >
                  {branchName(a.branch_id)}
                  <span className="text-muted-foreground">
                    ({roleLabel(a.role)})
                  </span>
                  <button
                    onClick={() => remove(a.branch_id)}
                    disabled={pending}
                    className="text-destructive hover:opacity-70"
                    aria-label={t('settings.users.ariaRemove')}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Add assignment */}
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">{t('settings.users.branchLabel')}</Label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">{t('settings.users.branchPlaceholder')}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} · {b.name_ar || b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('settings.users.roleLabel')}</Label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                {roles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.name_ar}
                  </option>
                ))}
              </select>
            </div>
            {showSupervisor && (
              <div className="space-y-1">
                <Label className="text-xs">{t('settings.users.reportsToLabel')}</Label>
                <select
                  value={reportsTo}
                  onChange={(e) => setReportsTo(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">{t('settings.users.reportsToNone')}</option>
                  {allProfiles
                    .filter((u) => u.id !== profile.id)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name || u.email}
                      </option>
                    ))}
                </select>
              </div>
            )}
            <Button size="sm" onClick={add} disabled={pending}>
              <Plus className="h-4 w-4" /> {t('settings.users.assignButton')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
