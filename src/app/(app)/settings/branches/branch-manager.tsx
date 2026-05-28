'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { upsertBranch, toggleBranchActive } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { Branch, Company } from '@/lib/erp/types';
import { Plus, Pencil, Loader2, Building2, X } from 'lucide-react';
import { toast } from 'sonner';

export function BranchManager({
  company,
  branches,
}: {
  company: Company;
  branches: Branch[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Branch | null | 'new'>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await upsertBranch(formData);
      if (!res.ok) {
        toast.error(res.error ?? 'حدث خطأ');
        return;
      }
      toast.success(editing === 'new' ? 'تمت إضافة الفرع' : 'تم تحديث الفرع');
      setEditing(null);
      router.refresh();
    });
  }

  function onToggle(b: Branch) {
    startTransition(async () => {
      const res = await toggleBranchActive(b.id, !b.is_active);
      if (!res.ok) toast.error(res.error ?? 'حدث خطأ');
      else router.refresh();
    });
  }

  const current = editing === 'new' ? null : editing;

  return (
    <div className="space-y-4">
      {editing === null && (
        <Button onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> إضافة فرع
        </Button>
      )}

      {editing !== null && (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">
                {editing === 'new' ? 'فرع جديد' : 'تعديل الفرع'}
              </h3>
              <button
                onClick={() => setEditing(null)}
                className="rounded-md p-1 hover:bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={onSubmit} className="space-y-4">
              <input type="hidden" name="company_id" value={company.id} />
              {current && <input type="hidden" name="id" value={current.id} />}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="code">كود الفرع *</Label>
                  <Input
                    id="code"
                    name="code"
                    dir="ltr"
                    placeholder="CAI"
                    defaultValue={current?.code ?? ''}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">المدينة</Label>
                  <Input
                    id="city"
                    name="city"
                    placeholder="القاهرة"
                    defaultValue={current?.city ?? ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name_ar">اسم الفرع (عربي)</Label>
                  <Input
                    id="name_ar"
                    name="name_ar"
                    placeholder="فرع القاهرة"
                    defaultValue={current?.name_ar ?? ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">اسم الفرع (إنجليزي) *</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="Cairo Branch"
                    defaultValue={current?.name ?? ''}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">الهاتف</Label>
                  <Input
                    id="phone"
                    name="phone"
                    dir="ltr"
                    defaultValue={current?.phone ?? ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">العنوان</Label>
                  <Input
                    id="address"
                    name="address"
                    defaultValue={current?.address ?? ''}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="is_hq"
                  defaultChecked={current?.is_hq ?? false}
                  className="h-4 w-4"
                />
                المركز الرئيسي
              </label>
              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                  حفظ
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(null)}
                >
                  إلغاء
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {branches.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
            <Building2 className="h-8 w-8" />
            <p>لا توجد فروع بعد. أضف أول فرع.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {branches.map((b) => (
            <Card key={b.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{b.code}</Badge>
                      {b.is_hq && <Badge variant="info">رئيسي</Badge>}
                      {!b.is_active && (
                        <Badge variant="destructive">موقوف</Badge>
                      )}
                    </div>
                    <p className="mt-2 truncate font-semibold">
                      {b.name_ar || b.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {b.city || '—'}
                    </p>
                  </div>
                  <button
                    onClick={() => setEditing(b)}
                    className="rounded-md p-1.5 hover:bg-secondary"
                    aria-label="تعديل"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 border-t pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => onToggle(b)}
                    className="text-xs"
                  >
                    {b.is_active ? 'إيقاف الفرع' : 'تفعيل الفرع'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
