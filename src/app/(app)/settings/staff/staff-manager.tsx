'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2, X, KeyRound, UserCog, UserCheck, UserX } from 'lucide-react';
import { usePrompt } from '@/components/prompt-dialog';
import { createStaff, setStaffRole, setStaffActive, resetStaffPassword } from './actions';

export interface StaffMember { id: string; full_name: string | null; email: string | null; is_active: boolean; role: string }
export interface RoleOption { key: string; name_ar: string }

const selectCls =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function StaffManager({
  currentUserId, staff, roles,
}: {
  currentUserId: string; staff: StaffMember[]; roles: RoleOption[];
}) {
  const router = useRouter();
  const prompt = usePrompt();
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();

  const roleName = (key: string) => roles.find((r) => r.key === key)?.name_ar ?? key;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) { toast.error(res.error ?? 'حدث خطأ'); return; }
      toast.success(ok);
      router.refresh();
    });
  }

  function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      const res = await createStaff(fd);
      if (!res.ok) { toast.error(res.error ?? 'حدث خطأ'); return; }
      toast.success('تم إضافة الموظف');
      form.reset();
      setAdding(false);
      router.refresh();
    });
  }

  function resetPw(m: StaffMember) {
    prompt({
      title: 'تعيين كلمة مرور جديدة',
      message: `${m.full_name || m.email} — ٦ أحرف على الأقل`,
      label: 'كلمة المرور الجديدة', type: 'password', confirmText: 'حفظ',
    }).then((raw) => {
      if (raw == null) return;
      if (raw.length < 6) { toast.error('كلمة المرور قصيرة'); return; }
      run(() => resetStaffPassword(m.id, raw), 'تم تغيير كلمة المرور');
    });
  }

  return (
    <div className="space-y-4">
      <div>
        {!adding ? (
          <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> موظف جديد</Button>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={onCreate} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1"><Label>الاسم *</Label><Input name="full_name" required placeholder="د. أحمد محمد" /></div>
                  <div className="space-y-1"><Label>البريد الإلكتروني *</Label><Input name="email" type="email" dir="ltr" required /></div>
                  <div className="space-y-1"><Label>كلمة المرور *</Label><Input name="password" type="text" dir="ltr" required placeholder="٦ أحرف على الأقل" /></div>
                  <div className="space-y-1">
                    <Label>الدور *</Label>
                    <select name="role" className={`${selectCls} h-10`} required defaultValue="">
                      <option value="" disabled>اختر الدور</option>
                      {roles.map((r) => <option key={r.key} value={r.key}>{r.name_ar}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} إضافة</Button>
                  <Button type="button" variant="outline" onClick={() => setAdding(false)}><X className="h-4 w-4" /> إلغاء</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-secondary/50 text-muted-foreground">
                <tr>
                  <th className="p-3 text-right font-medium">الموظف</th>
                  <th className="p-3 text-right font-medium">الدور</th>
                  <th className="p-3 text-center font-medium">الحالة</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {staff.map((m) => {
                  const self = m.id === currentUserId;
                  return (
                    <tr key={m.id} className="border-b align-middle">
                      <td className="p-3">
                        <span className="font-medium">{m.full_name || '—'}{self && <span className="text-xs text-muted-foreground"> (أنت)</span>}</span>
                        <span className="block text-xs text-muted-foreground" dir="ltr">{m.email}</span>
                      </td>
                      <td className="p-3">
                        {self ? (
                          <Badge variant="secondary">{roleName(m.role)}</Badge>
                        ) : (
                          <select
                            className={selectCls}
                            value={m.role}
                            disabled={pending}
                            onChange={(e) => run(() => setStaffRole(m.id, e.target.value), 'تم تغيير الدور')}
                          >
                            {roles.map((r) => <option key={r.key} value={r.key}>{r.name_ar}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant={m.is_active ? 'success' : 'secondary'}>{m.is_active ? 'نشط' : 'موقوف'}</Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" disabled={pending} onClick={() => resetPw(m)}><KeyRound className="h-3.5 w-3.5" /> كلمة المرور</Button>
                          {!self && (
                            m.is_active ? (
                              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setStaffActive(m.id, false), 'تم إيقاف الحساب')}><UserX className="h-3.5 w-3.5" /> إيقاف</Button>
                            ) : (
                              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setStaffActive(m.id, true), 'تم تفعيل الحساب')}><UserCheck className="h-3.5 w-3.5" /> تفعيل</Button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {staff.length === 0 && (
                  <tr><td colSpan={4} className="p-8 text-center text-muted-foreground"><UserCog className="mx-auto mb-2 h-8 w-8" />لا يوجد موظفون بعد.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
