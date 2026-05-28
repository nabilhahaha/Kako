'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ALL_PERMISSIONS, PERMISSION_LABELS, type Permission } from '@/lib/erp/permissions';
import {
  setCompanyRoleEnabled,
  setCompanyRolePermission,
  addCompanyRole,
} from './permission-actions';
import { Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

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
}: {
  companyId: string;
  roles: CompanyRoleRow[];
  /** role_keys enabled for this company */
  enabledRoles: string[];
  /** company-scoped permissions, per role_key */
  permsByRole: Record<string, string[]>;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [pending, startTransition] = useTransition();

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
        toast.error(res.error ?? 'حدث خطأ');
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
        toast.error(res.error ?? 'حدث خطأ');
        router.refresh();
      }
    });
  }

  function addRole() {
    startTransition(async () => {
      const res = await addCompanyRole(companyId, newName, newKey);
      if (!res.ok) {
        toast.error(res.error ?? 'حدث خطأ');
        return;
      }
      toast.success('تمت إضافة الدور لهذه الشركة');
      setAdding(false);
      setNewName('');
      setNewKey('');
      router.refresh();
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">الأدوار والصلاحيات</p>
          <p className="text-xs text-muted-foreground">
            فعّل الأدوار المطلوبة لهذه الشركة وحدد صلاحيات كل دور. الإعداد مستقل لكل شركة.
          </p>
        </div>
        {!adding ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> دور جديد
          </Button>
        ) : null}
      </div>

      {adding && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 pt-6">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">اسم الدور</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="مثال: صيدلي" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">المفتاح (إنجليزي)</label>
              <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} dir="ltr" placeholder="pharmacist" />
            </div>
            <Button onClick={addRole} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />} إضافة
            </Button>
            <Button variant="outline" onClick={() => setAdding(false)}>إلغاء</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-secondary/50 text-muted-foreground">
                <tr>
                  <th className="sticky right-0 bg-secondary/50 p-3 text-right font-medium">الصلاحية</th>
                  {roles.map((r) => (
                    <th key={r.key} className="p-3 text-center font-medium whitespace-nowrap">
                      <div className="flex flex-col items-center gap-1">
                        <span>{r.name_ar}</span>
                        <label className="flex items-center gap-1 text-[11px] font-normal">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-primary"
                            checked={enabled.has(r.key)}
                            disabled={pending}
                            onChange={(e) => toggleRole(r.key, e.target.checked)}
                          />
                          مفعّل
                        </label>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              {[...groups.entries()].map(([group, perms]) => (
                <tbody key={group}>
                  <tr className="border-b bg-secondary/30">
                    <td colSpan={roles.length + 1} className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                      {group}
                    </td>
                  </tr>
                  {perms.map((p) => (
                    <tr key={p} className="border-b">
                      <td className="sticky right-0 bg-background p-3">{PERMISSION_LABELS[p].ar}</td>
                      {roles.map((r) => {
                        const roleOn = enabled.has(r.key);
                        const checked = matrix[r.key]?.has(p) ?? false;
                        return (
                          <td key={r.key} className="p-3 text-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-primary disabled:opacity-40"
                              checked={checked}
                              disabled={!roleOn || pending}
                              onChange={(e) => togglePerm(r.key, p, e.target.checked)}
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

      <p className="text-xs text-muted-foreground">
        تسري التغييرات على مستخدمي الشركة عند تحديث الصفحة أو إعادة تسجيل الدخول. الأدوار غير المفعّلة لا تمنح أي صلاحية.
      </p>
    </div>
  );
}
