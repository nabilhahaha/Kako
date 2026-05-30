'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useConfirm } from '@/components/confirm-dialog';
import { ALL_PERMISSIONS, PERMISSION_LABELS, PERMISSION_GROUP_LABELS, type Permission } from '@/lib/erp/permissions';
import { setRolePermission, createRole, deleteRole } from './actions';
import { Plus, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';

export interface RoleRow {
  key: string;
  name_ar: string;
  is_system: boolean;
  rank: number;
}

export function PermissionsMatrix({
  roles,
  permsByRole,
  canEdit,
}: {
  roles: RoleRow[];
  permsByRole: Record<string, string[]>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [pending, startTransition] = useTransition();

  // Local optimistic copy of the matrix.
  const [matrix, setMatrix] = useState<Record<string, Set<string>>>(
    Object.fromEntries(roles.map((r) => [r.key, new Set(permsByRole[r.key] ?? [])])),
  );

  function toggle(roleKey: string, perm: Permission, enabled: boolean) {
    setMatrix((prev) => {
      const next = { ...prev, [roleKey]: new Set(prev[roleKey]) };
      if (enabled) next[roleKey].add(perm);
      else next[roleKey].delete(perm);
      return next;
    });
    startTransition(async () => {
      const res = await setRolePermission(roleKey, perm, enabled);
      if (!res.ok) {
        toast.error(res.error ?? t('settings.genericError'));
        router.refresh();
      }
    });
  }

  function addRole() {
    startTransition(async () => {
      const res = await createRole(newName, newKey);
      if (!res.ok) {
        toast.error(res.error ?? t('settings.genericError'));
        return;
      }
      toast.success(t('settings.permissions.toastRoleAdded'));
      setAdding(false);
      setNewName('');
      setNewKey('');
      router.refresh();
    });
  }

  function removeRole(r: RoleRow) {
    confirm({ title: t('settings.permissions.deleteRoleTitle', { name: r.name_ar }), confirmText: t('settings.permissions.deleteConfirm'), cancelText: t('settings.permissions.deleteCancel'), destructive: true }).then((ok) => {
      if (!ok) return;
      startTransition(async () => {
        const res = await deleteRole(r.key);
        if (!res.ok) toast.error(res.error ?? t('settings.genericError'));
        else { toast.success(t('settings.permissions.toastRoleDeleted')); router.refresh(); }
      });
    });
  }

  // Group permissions for display.
  const groups = new Map<string, Permission[]>();
  for (const p of ALL_PERMISSIONS) {
    const g = PERMISSION_LABELS[p].group;
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div>
          {!adding ? (
            <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('settings.permissions.newRole')}</Button>
          ) : (
            <Card>
              <CardContent className="flex flex-wrap items-end gap-3 pt-6">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('settings.permissions.roleNameLabel')}</label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('settings.permissions.roleNamePlaceholder')} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('settings.permissions.roleKeyLabel')}</label>
                  <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} dir="ltr" placeholder="area_supervisor" />
                </div>
                <Button onClick={addRole} disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('settings.permissions.addRole')}</Button>
                <Button variant="outline" onClick={() => setAdding(false)}>{t('settings.cancel')}</Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-secondary/50 text-muted-foreground">
                <tr>
                  <th className="sticky right-0 bg-secondary/50 p-3 text-right font-medium">{t('settings.permissions.colPermission')}</th>
                  {roles.map((r) => (
                    <th key={r.key} className="p-3 text-center font-medium whitespace-nowrap">
                      <div className="flex flex-col items-center gap-1">
                        <span>{r.name_ar}</span>
                        {canEdit && !r.is_system && (
                          <button onClick={() => removeRole(r)} className="text-destructive hover:opacity-70" title={t('settings.permissions.ariaDeleteRole')}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              {[...groups.entries()].map(([group, perms]) => (
                <tbody key={group}>
                  <tr className="border-b bg-secondary/30">
                    <td colSpan={roles.length + 1} className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">{PERMISSION_GROUP_LABELS[group]?.[locale] ?? group}</td>
                  </tr>
                  {perms.map((p) => (
                    <tr key={p} className="border-b">
                      <td className="sticky right-0 bg-background p-3">{PERMISSION_LABELS[p][locale]}</td>
                      {roles.map((r) => {
                        const checked = matrix[r.key]?.has(p) ?? false;
                        // admin/manager are always-all by convention; still editable here.
                        return (
                          <td key={r.key} className="p-3 text-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-primary"
                              checked={checked}
                              disabled={!canEdit || pending}
                              onChange={(e) => toggle(r.key, p, e.target.checked)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </CardContent>
      </Card>
      {!canEdit && <p className="text-xs text-muted-foreground">{t('settings.permissions.readOnlyNote')}</p>}
      <p className="text-xs text-muted-foreground">{t('settings.permissions.effectNote')}</p>
    </div>
  );
}
