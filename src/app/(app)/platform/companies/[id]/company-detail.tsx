'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, CalendarPlus, Power, Save, Gauge } from 'lucide-react';
import type { Branch, Company } from '@/lib/erp/types';
import type { Plan, CompanyUsage } from '@/lib/erp/plans';
import { BRANCH_ROLES } from '@/lib/erp/constants';
import {
  BUSINESS_TYPE_LABELS,
  BUSINESS_TYPES,
  daysLeft,
  subscriptionState,
} from '@/lib/erp/subscription';
import {
  updateCompany,
  setCompanyActive,
  setSubscriptionEnd,
  setCompanyPlan,
  addBranch,
  onboardAdmin,
} from '../actions';

export interface MemberRow {
  userId: string;
  branchId: string;
  branchName: string;
  role: string;
  isDefault: boolean;
  fullName: string | null;
  email: string | null;
}

const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const STATE_BADGE = {
  active: { label: 'نشط', variant: 'success' as const },
  expiring: { label: 'قارب الانتهاء', variant: 'warning' as const },
  expired: { label: 'منتهٍ', variant: 'destructive' as const },
  suspended: { label: 'موقوف', variant: 'destructive' as const },
  open: { label: 'مفتوح', variant: 'info' as const },
};

function addMonths(base: Date, months: number): string {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function CompanyDetail({
  company,
  branches,
  members,
  companyRoles,
  plans,
  usage,
}: {
  company: Company;
  branches: Branch[];
  members: MemberRow[];
  /** Roles enabled for this company (key + Arabic label); used for onboarding. */
  companyRoles?: { key: string; name_ar: string }[];
  /** Available subscription plans (for the plan selector). */
  plans?: Plan[];
  /** Current usage tallies for this company. */
  usage?: CompanyUsage;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [customEnd, setCustomEnd] = useState('');

  const state = subscriptionState(company);
  const left = daysLeft(company);
  const badge = STATE_BADGE[state];

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? 'حدث خطأ');
        return;
      }
      toast.success(okMsg);
      router.refresh();
    });
  }

  function renewBy(months: number) {
    const anchor =
      company.subscription_end && new Date(company.subscription_end) > new Date()
        ? new Date(company.subscription_end)
        : new Date();
    run(() => setSubscriptionEnd(company.id, addMonths(anchor, months)), 'تم تجديد الاشتراك');
  }

  function onSubmit(
    e: React.FormEvent<HTMLFormElement>,
    fn: (fd: FormData) => Promise<{ ok: boolean; error?: string }>,
    okMsg: string,
    reset = false,
  ) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      const res = await fn(fd);
      if (!res.ok) {
        toast.error(res.error ?? 'حدث خطأ');
        return;
      }
      toast.success(okMsg);
      if (reset) form.reset();
      router.refresh();
    });
  }

  // Onboarding role options: the roles enabled for this company (incl. custom
  // ones). Falls back to the full built-in set when no company config is passed.
  const roleOptions =
    companyRoles && companyRoles.length > 0
      ? companyRoles
      : (Object.keys(BRANCH_ROLES) as (keyof typeof BRANCH_ROLES)[]).map((key) => ({
          key,
          name_ar: BRANCH_ROLES[key].ar,
        }));

  return (
    <div className="space-y-6">
      {/* Subscription */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="font-semibold">الاشتراك</span>
              <Badge variant={badge.variant}>{badge.label}</Badge>
              {company.subscription_end && (
                <span className="text-sm text-muted-foreground" dir="ltr">
                  ينتهي {company.subscription_end}
                  {left !== null && ` (${left} يوم)`}
                </span>
              )}
            </div>
            <Button
              variant={company.is_active ? 'outline' : 'default'}
              size="sm"
              disabled={pending}
              onClick={() =>
                run(() => setCompanyActive(company.id, !company.is_active), company.is_active ? 'تم الإيقاف' : 'تم التفعيل')
              }
            >
              <Power className="h-4 w-4" />
              {company.is_active ? 'إيقاف الشركة' : 'تفعيل الشركة'}
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => renewBy(1)}>
              <CalendarPlus className="h-4 w-4" /> +شهر
            </Button>
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => renewBy(3)}>
              <CalendarPlus className="h-4 w-4" /> +٣ أشهر
            </Button>
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => renewBy(12)}>
              <CalendarPlus className="h-4 w-4" /> +سنة
            </Button>
            <div className="flex items-end gap-2">
              <Input
                type="date"
                dir="ltr"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-44"
              />
              <Button
                size="sm"
                disabled={pending || !customEnd}
                onClick={() => customEnd && run(() => setSubscriptionEnd(company.id, customEnd), 'تم تحديث تاريخ الانتهاء')}
              >
                تطبيق
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plan & limits */}
      {plans && plans.length > 0 && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 font-semibold">
                <Gauge className="h-4 w-4" /> الخطة والحدود
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">الخطة</span>
                <select
                  className={selectCls + ' w-44'}
                  value={company.plan_key ?? ''}
                  disabled={pending}
                  onChange={(e) => run(() => setCompanyPlan(company.id, e.target.value), 'تم تحديث الخطة')}
                >
                  {plans.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name_ar}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {usage && (() => {
              const plan = plans.find((p) => p.key === company.plan_key) ?? null;
              const fmt = (n: number, max: number | null | undefined) =>
                max == null ? `${n} / ∞` : `${n} / ${max}`;
              const over = (n: number, max: number | null | undefined) => max != null && n >= max;
              const items: { label: string; used: number; max: number | null | undefined }[] = [
                { label: 'المستخدمون', used: usage.users, max: plan?.max_users },
                { label: 'الفروع', used: usage.branches, max: plan?.max_branches },
                { label: 'المنتجات', used: usage.products, max: plan?.max_products },
              ];
              return (
                <div className="grid grid-cols-3 gap-3">
                  {items.map((it) => (
                    <div key={it.label} className="rounded-md border p-3 text-center">
                      <p className="text-xs text-muted-foreground">{it.label}</p>
                      <p className={`text-lg font-bold tabular-nums ${over(it.used, it.max) ? 'text-destructive' : ''}`} dir="ltr">
                        {fmt(it.used, it.max)}
                      </p>
                    </div>
                  ))}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Company info */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={(e) => onSubmit(e, updateCompany, 'تم حفظ بيانات الشركة')} className="space-y-4">
            <input type="hidden" name="id" value={company.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name_ar">اسم الشركة (عربي)</Label>
                <Input id="name_ar" name="name_ar" defaultValue={company.name_ar ?? ''} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">اسم الشركة (إنجليزي) *</Label>
                <Input id="name" name="name" required defaultValue={company.name} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="business_type">نوع النشاط</Label>
                <select
                  id="business_type"
                  name="business_type"
                  className={selectCls}
                  defaultValue={company.business_type ?? 'general'}
                >
                  {BUSINESS_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {BUSINESS_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="subscription_start">بداية الاشتراك</Label>
                  <Input
                    id="subscription_start"
                    name="subscription_start"
                    type="date"
                    dir="ltr"
                    defaultValue={company.subscription_start ?? ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subscription_end">نهاية الاشتراك</Label>
                  <Input
                    id="subscription_end"
                    name="subscription_end"
                    type="date"
                    dir="ltr"
                    defaultValue={company.subscription_end ?? ''}
                  />
                </div>
              </div>
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              حفظ
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Branches */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <h3 className="font-semibold">الفروع ({branches.length})</h3>
          {branches.length > 0 && (
            <div className="divide-y rounded-md border">
              {branches.map((b) => (
                <div key={b.id} className="flex items-center justify-between p-3 text-sm">
                  <span className="font-medium">
                    {b.name_ar || b.name}{' '}
                    <span className="text-muted-foreground" dir="ltr">
                      ({b.code})
                    </span>
                  </span>
                  {b.is_hq && <Badge variant="secondary">المركز الرئيسي</Badge>}
                </div>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => onSubmit(e, addBranch, 'تم إضافة الفرع', true)}
            className="grid gap-3 sm:grid-cols-4"
          >
            <input type="hidden" name="company_id" value={company.id} />
            <Input name="code" placeholder="كود الفرع *" dir="ltr" required />
            <Input name="name" placeholder="اسم الفرع (إنجليزي) *" required />
            <Input name="name_ar" placeholder="اسم الفرع (عربي)" />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" name="is_hq" /> رئيسي
              </label>
              <Button type="submit" size="sm" disabled={pending}>
                <Plus className="h-4 w-4" /> إضافة
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Users */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <h3 className="font-semibold">المستخدمون ({members.length})</h3>
          {members.length > 0 && (
            <div className="divide-y rounded-md border">
              {members.map((m) => (
                <div key={`${m.userId}-${m.branchId}`} className="flex items-center justify-between p-3 text-sm">
                  <div>
                    <span className="font-medium">{m.fullName || m.email || m.userId.slice(0, 8)}</span>
                    <span className="mx-1 text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{m.branchName}</span>
                  </div>
                  <Badge variant="secondary">
                    {BRANCH_ROLES[m.role as keyof typeof BRANCH_ROLES]?.ar ?? m.role}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {branches.length === 0 ? (
            <p className="text-sm text-muted-foreground">أضف فرعًا أولًا لتتمكن من إنشاء مستخدم.</p>
          ) : (
            <form
              onSubmit={(e) => onSubmit(e, onboardAdmin, 'تم إنشاء المستخدم', true)}
              className="space-y-3"
            >
              <input type="hidden" name="company_id" value={company.id} />
              <p className="text-sm font-medium">إنشاء مستخدم جديد للشركة</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input name="full_name" placeholder="الاسم الكامل" />
                <Input name="email" type="email" placeholder="البريد الإلكتروني *" dir="ltr" required />
                <Input name="password" type="password" placeholder="كلمة المرور (٦ أحرف على الأقل) *" dir="ltr" required />
                <select name="branch_id" className={selectCls} required defaultValue="">
                  <option value="" disabled>
                    اختر الفرع *
                  </option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name_ar || b.name}
                    </option>
                  ))}
                </select>
                <select name="role" className={selectCls} defaultValue="admin">
                  {roleOptions.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.name_ar}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                إنشاء المستخدم
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
