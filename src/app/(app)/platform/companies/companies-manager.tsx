'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Settings2, Power } from 'lucide-react';
import type { Company } from '@/lib/erp/types';
import {
  BUSINESS_TYPE_LABELS,
  BUSINESS_TYPES,
  daysLeft,
  subscriptionState,
  type SubscriptionState,
} from '@/lib/erp/subscription';
import { ALL_MODULES, MODULE_LABELS, type Module } from '@/lib/erp/navigation';
import { createCompany, setCompanyActive } from './actions';

export interface CompanyRow {
  company: Company;
  branches: number;
  users: number;
}

const STATE_BADGE: Record<SubscriptionState, { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' | 'info' }> = {
  active: { label: 'نشط', variant: 'success' },
  expiring: { label: 'قارب الانتهاء', variant: 'warning' },
  expired: { label: 'منتهٍ', variant: 'destructive' },
  suspended: { label: 'موقوف', variant: 'destructive' },
  open: { label: 'مفتوح', variant: 'info' },
};

const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function CompaniesManager({ rows, btDefaults, btRoles, roleLabels }: { rows: CompanyRow[]; btDefaults: Record<string, string[]>; btRoles: Record<string, string[]>; roleLabels: Record<string, string> }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [pending, startTransition] = useTransition();
  const [businessType, setBusinessType] = useState('general');
  const defaultsFor = (bt: string) => new Set<string>((btDefaults[bt] ?? []).filter((m) => (ALL_MODULES as string[]).includes(m)));
  const [modules, setModules] = useState<Set<string>>(() => defaultsFor('general'));
  const [roles, setRoles] = useState<Set<string>>(() => new Set(btRoles['general'] ?? []));

  function onBusinessType(bt: string) {
    setBusinessType(bt);
    setModules(defaultsFor(bt)); // reset module + role selection to the type's defaults
    setRoles(new Set(btRoles[bt] ?? []));
  }
  function toggleModule(m: Module, on: boolean) {
    setModules((prev) => { const next = new Set(prev); if (on) next.add(m); else next.delete(m); return next; });
  }
  function toggleRole(r: string, on: boolean) {
    setRoles((prev) => { const next = new Set(prev); if (on) next.add(r); else next.delete(r); return next; });
  }
  const templateRoles = btRoles[businessType] ?? [];

  function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const res = await createCompany(formData);
      if (!res.ok) {
        toast.error(res.error ?? 'حدث خطأ');
        return;
      }
      toast.success('تم إنشاء الشركة');
      form.reset();
      setShowForm(false);
      router.refresh();
    });
  }

  function onToggleActive(id: string, next: boolean) {
    startTransition(async () => {
      const res = await setCompanyActive(id, next);
      if (!res.ok) {
        toast.error(res.error ?? 'حدث خطأ');
        return;
      }
      toast.success(next ? 'تم تفعيل الشركة' : 'تم إيقاف الشركة');
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm((s) => !s)} variant={showForm ? 'secondary' : 'default'}>
          <Plus className="h-4 w-4" />
          شركة جديدة
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={onCreate} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name_ar">اسم الشركة (عربي)</Label>
                  <Input id="name_ar" name="name_ar" placeholder="شركة النور للتوزيع" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">اسم الشركة (إنجليزي) *</Label>
                  <Input id="name" name="name" required placeholder="Al Noor Distribution" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">المعرّف (للرابط)</Label>
                  <Input id="slug" name="slug" dir="ltr" placeholder="al-noor" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="business_type">نوع النشاط</Label>
                  <select id="business_type" name="business_type" className={selectCls} value={businessType} onChange={(e) => onBusinessType(e.target.value)}>
                    {BUSINESS_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {BUSINESS_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subscription_start">بداية الاشتراك</Label>
                  <Input id="subscription_start" name="subscription_start" type="date" dir="ltr" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subscription_end">نهاية الاشتراك</Label>
                  <Input id="subscription_end" name="subscription_end" type="date" dir="ltr" />
                </div>
              </div>
              <div className="space-y-2 rounded-md border bg-secondary/20 p-3">
                <Label>الموديولات (الوحدات المتاحة للشركة)</Label>
                <p className="text-xs text-muted-foreground">تتعبّى تلقائياً حسب النشاط — شيل/ضيف اللي تحبه قبل الإنشاء.</p>
                <input type="hidden" name="_modules" value="1" />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {ALL_MODULES.map((m) => (
                    <label key={m} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="modules" value={m} checked={modules.has(m)} onChange={(e) => toggleModule(m, e.target.checked)} className="h-4 w-4" />
                      {MODULE_LABELS[m]}
                    </label>
                  ))}
                </div>
              </div>

              {templateRoles.length > 0 && (
                <div className="space-y-2 rounded-md border bg-secondary/20 p-3">
                  <Label>الأدوار المتاحة للشركة</Label>
                  <p className="text-xs text-muted-foreground">شيل الأدوار اللي مش محتاجها (تقدر تظبط صلاحيات كل دور بالتفصيل بعد الإنشاء).</p>
                  <input type="hidden" name="_roles" value="1" />
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {templateRoles.map((r) => (
                      <label key={r} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="roles" value={r} checked={roles.has(r)} onChange={(e) => toggleRole(r, e.target.checked)} className="h-4 w-4" />
                        {roleLabels[r] ?? r}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                إنشاء الشركة
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">لا توجد شركات بعد. أنشئ أول شركة.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-muted-foreground">
                  <tr className="text-right">
                    <th className="p-3 font-medium">الشركة</th>
                    <th className="p-3 font-medium">النشاط</th>
                    <th className="p-3 font-medium">الحالة</th>
                    <th className="p-3 font-medium">الانتهاء</th>
                    <th className="p-3 font-medium">الفروع</th>
                    <th className="p-3 font-medium">المستخدمون</th>
                    <th className="p-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ company, branches, users }) => {
                    const state = subscriptionState(company);
                    const left = daysLeft(company);
                    const badge = STATE_BADGE[state];
                    return (
                      <tr key={company.id} className="border-b last:border-0">
                        <td className="p-3">
                          <div className="font-medium">{company.name_ar || company.name}</div>
                          {company.slug && (
                            <div dir="ltr" className="text-right text-xs text-muted-foreground">
                              /{company.slug}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {company.business_type
                            ? BUSINESS_TYPE_LABELS[company.business_type]
                            : '—'}
                        </td>
                        <td className="p-3">
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {company.subscription_end ? (
                            <span dir="ltr">
                              {company.subscription_end}
                              {left !== null && (
                                <span className="text-xs"> ({left} يوم)</span>
                              )}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="p-3">{branches}</td>
                        <td className="p-3">{users}</td>
                        <td className="p-3">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant={company.is_active ? 'outline' : 'default'}
                              size="sm"
                              disabled={pending}
                              onClick={() => onToggleActive(company.id, !company.is_active)}
                            >
                              <Power className="h-4 w-4" />
                              {company.is_active ? 'إيقاف' : 'تفعيل'}
                            </Button>
                            <Link href={`/platform/companies/${company.id}`}>
                              <Button variant="secondary" size="sm">
                                <Settings2 className="h-4 w-4" />
                                إدارة
                              </Button>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
