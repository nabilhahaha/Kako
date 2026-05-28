'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { upsertWarehouse, toggleWarehouseActive } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { Branch, Warehouse } from '@/lib/erp/types';
import { Plus, Pencil, Loader2, X, Warehouse as WarehouseIcon } from 'lucide-react';
import { toast } from 'sonner';

export function WarehousesManager({
  warehouses,
  branches,
}: {
  warehouses: Warehouse[];
  branches: Branch[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Warehouse | null | 'new'>(null);
  const [pending, startTransition] = useTransition();

  const branchName = (id: string) => {
    const b = branches.find((x) => x.id === id);
    return b ? `${b.code} · ${b.name_ar || b.name}` : '—';
  };

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await upsertWarehouse(formData);
      if (!res.ok) {
        toast.error(res.error ?? 'حدث خطأ');
        return;
      }
      toast.success(editing === 'new' ? 'تمت إضافة المخزن' : 'تم تحديث المخزن');
      setEditing(null);
      router.refresh();
    });
  }

  function onToggle(w: Warehouse) {
    startTransition(async () => {
      const res = await toggleWarehouseActive(w.id, !w.is_active);
      if (!res.ok) toast.error(res.error ?? 'حدث خطأ');
      else router.refresh();
    });
  }

  const current = editing === 'new' ? null : editing;
  const noBranches = branches.length === 0;

  return (
    <div className="space-y-4">
      {editing === null && (
        <Button onClick={() => setEditing('new')} disabled={noBranches}>
          <Plus className="h-4 w-4" /> مخزن جديد
        </Button>
      )}
      {noBranches && (
        <p className="text-sm text-warning">
          أنشئ فرعاً أولاً من إعدادات الفروع قبل إضافة مخزن.
        </p>
      )}

      {editing !== null && (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">
                {editing === 'new' ? 'مخزن جديد' : `تعديل: ${current?.name_ar || current?.name}`}
              </h3>
              <button onClick={() => setEditing(null)} className="rounded-md p-1 hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={onSubmit} className="space-y-4">
              {current && <input type="hidden" name="id" value={current.id} />}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="الفرع *">
                  <select name="branch_id" defaultValue={current?.branch_id ?? ''} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" required>
                    <option value="">اختر فرعاً…</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.code} · {b.name_ar || b.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="كود المخزن *"><Input name="code" dir="ltr" placeholder="WH1" defaultValue={current?.code ?? ''} required /></Field>
                <Field label="الاسم (عربي)"><Input name="name_ar" placeholder="المخزن الرئيسي" defaultValue={current?.name_ar ?? ''} /></Field>
                <Field label="الاسم (إنجليزي) *"><Input name="name" placeholder="Main Warehouse" defaultValue={current?.name ?? ''} required /></Field>
                <Field label="الموقع"><Input name="location" defaultValue={current?.location ?? ''} /></Field>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>إلغاء</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {warehouses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
            <WarehouseIcon className="h-8 w-8" />
            <p>لا توجد مخازن بعد.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {warehouses.map((w) => (
            <Card key={w.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{w.code}</Badge>
                      {!w.is_active && <Badge variant="destructive">موقوف</Badge>}
                    </div>
                    <p className="mt-2 truncate font-semibold">{w.name_ar || w.name}</p>
                    <p className="text-sm text-muted-foreground">{branchName(w.branch_id)}</p>
                    {w.location && <p className="text-xs text-muted-foreground">{w.location}</p>}
                  </div>
                  <button onClick={() => setEditing(w)} className="rounded-md p-1.5 hover:bg-secondary" aria-label="تعديل">
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 border-t pt-3">
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => onToggle(w)} className="text-xs">
                    {w.is_active ? 'إيقاف المخزن' : 'تفعيل المخزن'}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
