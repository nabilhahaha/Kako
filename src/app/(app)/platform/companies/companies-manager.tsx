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

export function CompaniesManager({ rows }: { rows: CompanyRow[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [pending, startTransition] = useTransition();

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
                  <select id="business_type" name="business_type" className={selectCls} defaultValue="general">
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
